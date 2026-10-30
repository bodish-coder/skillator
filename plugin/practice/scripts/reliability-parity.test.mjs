import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compare, reportCode, runFixture, normalizeBriefOutput, briefParityResult } from './reliability-parity.mjs';

const sample = { code: 0, stdout: 'ok\n', stderr: '', files: { 'brief.md': '0123' } };
test('production normalization preserves semantic slash/backslash divergence', () => {
  for (const field of ['stdout', 'stderr']) {
    const left = { ...sample, [field]: normalizeBriefOutput('diagnostic: left\\right\r\n', 'C:\\fixture', '/tmp/fixture') };
    const right = { ...sample, [field]: normalizeBriefOutput('diagnostic: left/right\n', 'C:\\fixture', '/tmp/fixture') };
    assert.deepEqual(compare(left, right), [field]);
  }
});
test('identical wrong brief bytes cannot claim oracle parity passed', () => {
  const result = briefParityResult([sample, structuredClone(sample)], [{ status: 'failed', reason: 'Brief differs from exact UTF-8 oracle' }, { status: 'failed', reason: 'Brief differs from exact UTF-8 oracle' }]);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 1);
  assert.doesNotMatch(result.reason, /bytes match oracle/);
});
test('only exact known brief path lines and CRLF transport normalize', () => {
  const dir = 'C:\\temp\\fixture path';
  const shellRoot = '/tmp/fixture path';
  const expected = '<fixture>/.taskwork/task-3-brief.md\n';
  for (const path of [dir + '\\.taskwork\\task-3-brief.md', 'C:/temp/fixture path/.taskwork/task-3-brief.md', shellRoot + '/.taskwork/task-3-brief.md']) {
    assert.equal(normalizeBriefOutput(path + '\r\n', dir, shellRoot), expected);
    assert.equal(normalizeBriefOutput(path + '.other\n', dir, shellRoot), path + '.other\n');
  }
  assert.equal(normalizeBriefOutput('diagnostic: ' + dir + '\\left\\right\r\n', dir, shellRoot), 'diagnostic: ' + dir + '\\left\\right\n');
});
test('brief aggregation preserves blocked/incomplete outcomes and a passing control', () => {
  assert.equal(briefParityResult([sample], [{ status: 'passed' }, { status: 'blocked' }]).status, 'blocked');
  assert.equal(briefParityResult([], []).status, 'blocked');
  assert.equal(briefParityResult([sample], [{ status: 'passed' }, { status: 'failed' }]).status, 'failed');
  assert.equal(briefParityResult([sample, sample], [{ status: 'passed' }, { status: 'passed' }]).status, 'passed');
});
test('equal observations pass', () => assert.deepEqual(compare(sample, structuredClone(sample)), []));
for (const field of ['stdout', 'stderr', 'code', 'files']) {
  test(`independent ${field} divergence fails`, () => {
    const changed = structuredClone(sample);
    changed[field] = field === 'files' ? { 'brief.md': '0124' } : field === 'code' ? 2 : 'different\n';
    assert.deepEqual(compare(sample, changed), [field]);
  });
}
test('incomplete and all skipped are never passes; failures take precedence', () => {
  assert.equal(reportCode([]), 2);
  assert.equal(reportCode([{ status: 'skipped' }]), 2);
  assert.equal(reportCode([{ status: 'passed' }, { status: 'blocked' }]), 2);
  assert.equal(reportCode([{ status: 'passed' }, { status: 'skipped' }]), 0);
  assert.equal(reportCode([{ status: 'failed' }, { status: 'blocked' }]), 1);
});
test('timeout returns before a short-lived descendant closes inherited output', () => {
  const root = mkdtempSync(join(tmpdir(), 'parity-timeout-'));
  const evidence = { stdout: join(root, 'stdout'), stderr: join(root, 'stderr') };
  const child = `
    const { spawn } = require('node:child_process');
    spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 2000)'], { stdio: 'inherit', windowsHide: true });
    console.log('child started'); console.error('child diagnostic');
    setInterval(() => {}, 1000);
  `;
  const started = performance.now();
  const result = runFixture([process.execPath, '-e', child], { timeout: 300 }, evidence);
  assert.equal(result.error?.code, 'ETIMEDOUT');
  assert.ok(performance.now() - started < 1800, 'timeout waited for descendant output handles');
  assert.match(readFileSync(evidence.stdout, 'utf8'), /child started/);
  assert.match(readFileSync(evidence.stderr, 'utf8'), /child diagnostic/);
});
