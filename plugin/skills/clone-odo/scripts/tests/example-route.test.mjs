// Executes the actual example HTTP handler using Route API stubs and two
// owned loopback servers. This is an API-contract check, NOT a browser test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const source = readFileSync(new URL('../../templates/e2e.example.spec.ts', import.meta.url), 'utf8');
const block = source.match(/await page\.context\(\)\.route\('\*\*\/\*', async route => \{([\s\S]*?)\n  \}\);/);
assert.ok(block, 'could not locate the actual example route handler');
const makeHandler = new Function('base', 'errors', `return async route => {${block[1]}\n};`);

async function serve(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { origin: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    } };
}

async function exercise(kind, status = 200) {
  let localCalls = 0, otherCalls = 0;
  const other = await serve((req, res) => { otherCalls++; res.end('other'); });
  const local = await serve((req, res) => {
    localCalls++;
    if (status >= 300 && status < 400) res.writeHead(status, { location: other.origin + '/destination' });
    res.end('local');
  });
  const errors = [], result = { aborted: false, completed: false, status: null };
  const url = kind === 'other' ? other.origin : local.origin;
  const request = async redirect => {
    const response = await fetch(url, { redirect, signal: AbortSignal.timeout(3000) });
    await response.arrayBuffer();
    return { status: () => response.status };
  };
  try {
    await makeHandler(new URL(local.origin), errors)({
      request: () => ({ url: () => url }),
      abort: async () => { result.aborted = true; },
      // Models documented browser redirect-follow behavior of route.continue.
      continue: async () => { const r = await request('follow'); result.completed = true; result.status = r.status(); },
      // Models documented route.fetch maxRedirects:0 without installing Playwright.
      fetch: async options => request(options?.maxRedirects === 0 ? 'manual' : 'follow'),
      fulfill: async ({ response }) => {
        assert.ok(response.status() < 300 || response.status() >= 400, 'browser must not receive a redirect');
        result.completed = true; result.status = response.status();
      },
    });
    return { ...result, localCalls, otherCalls, errors };
  } finally {
    await Promise.all([local.close(), other.close()]);
  }
}

test('example permits a direct local response', { timeout: 10000 }, async () => {
  const r = await exercise('local');
  assert.equal(r.localCalls, 1);
  assert.equal(r.otherCalls, 0);
  assert.equal(r.completed, true);
  assert.equal(r.status, 200);
  assert.deepEqual(r.errors, []);
});

test('example blocks an initially different origin before any request', { timeout: 10000 }, async () => {
  const r = await exercise('other');
  assert.equal(r.localCalls, 0);
  assert.equal(r.otherCalls, 0);
  assert.equal(r.aborted, true);
  assert.ok(r.errors.length > 0);
});

for (const code of [302, 307]) {
  test(`example blocks ${code} before the other origin receives traffic`, { timeout: 10000 }, async () => {
    const r = await exercise('local', code);
    assert.equal(r.localCalls, 1);
    assert.equal(r.otherCalls, 0, 'redirect destination received a request');
    assert.equal(r.aborted, true);
    assert.equal(r.completed, false);
    assert.ok(r.errors.length > 0);
  });
}
