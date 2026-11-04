import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(HERE, '..');
const PLUGIN_ROOT = join(SKILL_ROOT, '..', '..');

const CONNECTORS_MD = join(SKILL_ROOT, 'references', 'connectors.md');
const PLATFORMS_MD = join(PLUGIN_ROOT, 'PLATFORMS.md');
const UPSTREAM_MD = join(SKILL_ROOT, 'UPSTREAM.md');
const FIXTURES_JSON = join(HERE, 'fixtures', 'connectors.json');

/**
 * Reference consumer implementation for connector capabilities.
 * Following code-yoda restraint: small, minimal, explicit.
 */
export const CAPABILITY_MAP = {
  chat_search: ['slack', 'teams', 'discord'],
  document_search: ['gdrive', 'notion', 'confluence'],
  code_search: ['github', 'gitlab'],
  issue_search: ['jira', 'linear', 'github_issues'],
  customer_search: ['zendesk', 'salesforce'],
};

export const CONNECTOR_STATUSES = ['discovered', 'authenticated', 'read-success', 'unavailable'];

/**
 * Resolves connector state and queries through the consumer.
 */
export function queryCapability(capability, query, sources = []) {
  const supportedTools = CAPABILITY_MAP[capability];
  if (!supportedTools) {
    return {
      capability,
      status: 'unavailable',
      reason: 'unknown_capability',
      items: [],
      sources: [],
      error: `Unknown capability: ${capability}`,
    };
  }

  // Filter sources matching capability
  const matchingSources = sources.filter(s => supportedTools.includes(s.tool));
  if (matchingSources.length === 0) {
    return {
      capability,
      status: 'unavailable',
      reason: 'no_connector',
      items: [],
      sources: [],
      fallback: 'No connector available for capability. Fallback to local files or manual reference.',
    };
  }

  const results = [];
  const sourceStatuses = [];
  let hasSuccess = false;
  let hasFailure = false;

  for (const src of matchingSources) {
    // 1. Check discovery
    if (!src.discovered) {
      sourceStatuses.push({ tool: src.tool, status: 'unavailable', reason: 'not_discovered' });
      hasFailure = true;
      continue;
    }

    // 2. Check authentication
    if (!src.authenticated) {
      sourceStatuses.push({
        tool: src.tool,
        status: 'unavailable',
        reason: 'auth_failure',
        error: src.authError || 'Authentication failed or missing token',
      });
      hasFailure = true;
      continue;
    }

    // 3. Check rate limiting
    if (src.rateLimited) {
      sourceStatuses.push({
        tool: src.tool,
        status: 'unavailable',
        reason: 'rate_limited',
        retryAfterMs: src.retryAfterMs || 60000,
        error: 'Rate limit exceeded for connector',
      });
      hasFailure = true;
      continue;
    }

    // 4. Check source execution
    if (src.sourceError) {
      sourceStatuses.push({
        tool: src.tool,
        status: 'unavailable',
        reason: 'source_failed',
        error: src.sourceError,
      });
      hasFailure = true;
      continue;
    }

    // 5. Read success (even if 0 items)
    const items = typeof src.execute === 'function' ? src.execute(query) : (src.items || []);
    sourceStatuses.push({
      tool: src.tool,
      status: 'read-success',
      itemCount: items.length,
      liveEvidence: src.liveEvidence || 'tested with stubs',
    });
    results.push(...items);
    hasSuccess = true;
  }

  // Overall status resolution
  let overallStatus = 'unavailable';
  let overallReason = undefined;

  if (hasSuccess && !hasFailure) {
    overallStatus = 'read-success';
  } else if (hasSuccess && hasFailure) {
    overallStatus = 'read-success'; // partial coverage
  } else if (!hasSuccess) {
    overallStatus = 'unavailable';
    overallReason = sourceStatuses[0]?.reason || 'all_sources_failed';
  }

  return {
    capability,
    status: overallStatus,
    reason: overallReason,
    partialCoverage: hasSuccess && hasFailure,
    items: results,
    sources: sourceStatuses,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('references/connectors.md exists and documents required capabilities, statuses and fallbacks', () => {
  assert.ok(existsSync(CONNECTORS_MD), 'connectors.md must exist');
  const content = readFileSync(CONNECTORS_MD, 'utf8');

  // Capability mapping
  assert.match(content, /chat_search/i, 'documents chat_search capability');
  assert.match(content, /document_search/i, 'documents document_search capability');
  assert.match(content, /code_search/i, 'documents code_search capability');
  assert.match(content, /issue_search/i, 'documents issue_search capability');

  // Four explicit statuses
  assert.match(content, /discovered/i, 'documents discovered status');
  assert.match(content, /authenticated/i, 'documents authenticated status');
  assert.match(content, /read-success/i, 'documents read-success status');
  assert.match(content, /unavailable/i, 'documents unavailable status');

  // Scenarios & fallbacks
  assert.match(content, /no connector/i, 'covers no connector fallback');
  assert.match(content, /auth(entication)? failure/i, 'covers auth failure fallback');
  assert.match(content, /rate limit/i, 'covers rate limit fallback');
  assert.match(content, /partial coverage/i, 'covers partial coverage fallback');
  assert.match(content, /no results/i, 'covers no-results distinction');
  assert.match(content, /source failed/i, 'covers source failed distinction');

  // Host-specific live status remains explicit
  assert.match(content, /verified live/i, 'mentions verified live status gate');
  assert.match(content, /tested with stubs/i, 'mentions tested with stubs level');
});

test('PLATFORMS.md links to connector reference and capability categories', () => {
  assert.ok(existsSync(PLATFORMS_MD), 'PLATFORMS.md must exist');
  const content = readFileSync(PLATFORMS_MD, 'utf8');

  assert.match(content, /connectors\.md/i, 'links to connectors.md');
  assert.match(content, /capability categories|connector capabilities/i, 'mentions connector capability categories');
});

test('UPSTREAM.md follows code-yoda/design-arwen UPSTREAM.md pattern and Apache-2.0 notice', () => {
  assert.ok(existsSync(UPSTREAM_MD), 'UPSTREAM.md must exist');
  const content = readFileSync(UPSTREAM_MD, 'utf8');

  // Upstream table header
  assert.match(content, /## Upstreams/, 'contains ## Upstreams section');
  assert.match(content, /anthropics\/knowledge-work-plugins/, 'records repository');
  assert.match(content, /enterprise-search\/CONNECTORS\.md/, 'records watched path');
  assert.match(content, /2574e29377c7173d0cecffef29a6ecbd7f8ccb5d/, 'records pinned commit');
  assert.match(content, /Apache-2\.0|Apache License, Version 2\.0/, 'contains Apache-2.0 license notice');
});

test('Scenario: capability mapping resolves real tools', () => {
  assert.deepEqual(CAPABILITY_MAP.chat_search, ['slack', 'teams', 'discord']);
  assert.deepEqual(CAPABILITY_MAP.document_search, ['gdrive', 'notion', 'confluence']);
  assert.deepEqual(CAPABILITY_MAP.code_search, ['github', 'gitlab']);
  assert.deepEqual(CAPABILITY_MAP.issue_search, ['jira', 'linear', 'github_issues']);
  assert.deepEqual(CAPABILITY_MAP.customer_search, ['zendesk', 'salesforce']);
});

test('Scenario: status distinction across discovered, authenticated, read-success, unavailable', () => {
  // Discovered only (not authenticated)
  const resDiscovered = queryCapability('chat_search', 'hello', [
    { tool: 'slack', discovered: true, authenticated: false },
  ]);
  assert.equal(resDiscovered.status, 'unavailable');
  assert.equal(resDiscovered.sources[0].reason, 'auth_failure');

  // Authenticated and executed successfully
  const resSuccess = queryCapability('chat_search', 'incident', [
    { tool: 'slack', discovered: true, authenticated: true, items: [{ id: 1, text: 'incident' }] },
  ]);
  assert.equal(resSuccess.status, 'read-success');
  assert.equal(resSuccess.items.length, 1);
  assert.equal(resSuccess.sources[0].status, 'read-success');
});

test('Scenario: no connector available for requested capability', () => {
  // 1. Empty source list
  const res1 = queryCapability('chat_search', 'test', []);
  assert.equal(res1.status, 'unavailable');
  assert.equal(res1.reason, 'no_connector');
  assert.ok(res1.fallback.includes('No connector'));
  assert.equal(res1.items.length, 0);

  // 2. Sources present, but none match the capability
  const res2 = queryCapability('chat_search', 'test', [
    { tool: 'github', discovered: true, authenticated: true, items: ['some code'] },
  ]);
  assert.equal(res2.status, 'unavailable');
  assert.equal(res2.reason, 'no_connector');
  assert.equal(res2.items.length, 0);
});

test('Scenario: authentication failure gracefully degrades without loop', () => {
  const res = queryCapability('document_search', 'q3 roadmap', [
    {
      tool: 'gdrive',
      discovered: true,
      authenticated: false,
      authError: 'OAuth2 token expired: invalid_grant',
    },
  ]);
  assert.equal(res.status, 'unavailable');
  assert.equal(res.reason, 'auth_failure');
  assert.equal(res.items.length, 0);
  assert.equal(res.sources[0].error, 'OAuth2 token expired: invalid_grant');
});

test('Scenario: rate limiting produces explicit backoff hint', () => {
  const res = queryCapability('issue_search', 'P1 bugs', [
    {
      tool: 'jira',
      discovered: true,
      authenticated: true,
      rateLimited: true,
      retryAfterMs: 30000,
    },
  ]);
  assert.equal(res.status, 'unavailable');
  assert.equal(res.reason, 'rate_limited');
  assert.equal(res.sources[0].retryAfterMs, 30000);
});

test('Scenario: partial coverage combines working sources and notes failed sources', () => {
  const sources = [
    {
      tool: 'slack',
      discovered: true,
      authenticated: true,
      items: [{ id: 'slack-1', text: 'deploy completed' }],
    },
    {
      tool: 'teams',
      discovered: true,
      authenticated: true,
      rateLimited: true,
    },
  ];

  const res = queryCapability('chat_search', 'deploy', sources);
  assert.equal(res.status, 'read-success');
  assert.equal(res.partialCoverage, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].id, 'slack-1');

  // Verify source status distinction
  const slackStatus = res.sources.find(s => s.tool === 'slack');
  const teamsStatus = res.sources.find(s => s.tool === 'teams');
  assert.equal(slackStatus.status, 'read-success');
  assert.equal(teamsStatus.status, 'unavailable');
  assert.equal(teamsStatus.reason, 'rate_limited');
});

test('Scenario: no-results versus source-failed are strictly distinguished', () => {
  // Clean read with 0 matching items -> read-success
  const cleanZero = queryCapability('code_search', 'nonexistent_symbol_404', [
    {
      tool: 'github',
      discovered: true,
      authenticated: true,
      items: [],
    },
  ]);
  assert.equal(cleanZero.status, 'read-success');
  assert.equal(cleanZero.items.length, 0);
  assert.equal(cleanZero.sources[0].status, 'read-success');
  assert.equal(cleanZero.sources[0].itemCount, 0);
  assert.equal(cleanZero.sources[0].error, undefined);

  // Source error (e.g. 500 internal server error or network down) -> unavailable, NOT clean zero
  const sourceFailed = queryCapability('code_search', 'nonexistent_symbol_404', [
    {
      tool: 'github',
      discovered: true,
      authenticated: true,
      sourceError: 'HTTP 502 Bad Gateway: remote search cluster unreachable',
    },
  ]);
  assert.equal(sourceFailed.status, 'unavailable');
  assert.equal(sourceFailed.reason, 'source_failed');
  assert.equal(sourceFailed.sources[0].status, 'unavailable');
  assert.equal(sourceFailed.sources[0].reason, 'source_failed');
  assert.equal(sourceFailed.sources[0].error, 'HTTP 502 Bad Gateway: remote search cluster unreachable');
  // It must NOT be treated as a successful read with 0 items!
  assert.notEqual(sourceFailed.sources[0].status, 'read-success');
});

test('Scenario: host-specific live status remains explicit and uninflated', () => {
  const fixtureSource = {
    tool: 'slack',
    discovered: true,
    authenticated: true,
    liveEvidence: 'tested with stubs',
    items: [{ msg: 'stub message' }],
  };
  const res = queryCapability('chat_search', 'stub', [fixtureSource]);
  assert.equal(res.sources[0].liveEvidence, 'tested with stubs');
  assert.notEqual(res.sources[0].liveEvidence, 'verified live');
});

test('Offline fixtures: executes all scenarios using fixtures/connectors.json', () => {
  assert.ok(existsSync(FIXTURES_JSON), 'connectors.json fixture must exist');
  const fixtures = JSON.parse(readFileSync(FIXTURES_JSON, 'utf8'));

  const getSources = (keys) => keys.map(k => fixtures.sources[k]);

  // 1. No connector scenario
  const noConn = queryCapability(fixtures.scenarios.no_connector.capability, 'test', getSources(fixtures.scenarios.no_connector.sourceKeys));
  assert.equal(noConn.status, 'unavailable');
  assert.equal(noConn.reason, 'no_connector');

  // 2. Auth failure scenario
  const authFail = queryCapability(fixtures.scenarios.auth_failure.capability, 'roadmap', getSources(fixtures.scenarios.auth_failure.sourceKeys));
  assert.equal(authFail.status, 'unavailable');
  assert.equal(authFail.reason, 'auth_failure');

  // 3. Rate limit scenario
  const rateLimit = queryCapability(fixtures.scenarios.rate_limit.capability, 'chat', getSources(fixtures.scenarios.rate_limit.sourceKeys));
  assert.equal(rateLimit.status, 'unavailable');
  assert.equal(rateLimit.reason, 'rate_limited');

  // 4. Partial coverage scenario
  const partial = queryCapability(fixtures.scenarios.partial_coverage.capability, 'release', getSources(fixtures.scenarios.partial_coverage.sourceKeys));
  assert.equal(partial.status, 'read-success');
  assert.equal(partial.partialCoverage, true);
  assert.equal(partial.items.length, 1);

  // 5. Clean zero results scenario
  const cleanZero = queryCapability(fixtures.scenarios.clean_zero_results.capability, 'missing', getSources(fixtures.scenarios.clean_zero_results.sourceKeys));
  assert.equal(cleanZero.status, 'read-success');
  assert.equal(cleanZero.items.length, 0);

  // 6. Source failed scenario
  const srcFail = queryCapability(fixtures.scenarios.source_failed.capability, 'bug', getSources(fixtures.scenarios.source_failed.sourceKeys));
  assert.equal(srcFail.status, 'unavailable');
  assert.equal(srcFail.reason, 'source_failed');
  assert.notEqual(srcFail.status, 'read-success');
});
