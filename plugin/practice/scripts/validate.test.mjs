import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { childEnvironment, registry, runValidation } from './validate.mjs';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'validate-test-'));
  return {
    dir,
    options: { evidenceDirectory: dir, reportPath: join(dir, 'report.json'), log: () => {} },
    check(id, source, extra = {}) {
      const file = join(dir, id + '.mjs');
      writeFileSync(file, source, 'utf8');
      return { id, command: [process.execPath, file], cwd: dir, timeoutMs: 3000, ...extra };
    },
  };
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
async function waitFor(file) {
  for (let i = 0; i < 100 && !existsSync(file); i++) await delay(50);
  assert.ok(existsSync(file), 'fixture reached readiness');
}

test('four outcomes are exact, persisted, and a passing child mutation propagates', async () => {
  const f = fixture();
  const pass = f.check('pass', 'console.log("fixture pass");');
  const checks = [pass, f.check('fail', 'process.exit(3);'),
    { id: 'optional', command: ['nonexistent-validation-fixture-8a2f'], cwd: f.dir, timeoutMs: 1000, optional: true },
    f.check('blocked', 'throw Error("must not run")', { prerequisites: ['absent-prerequisite'] })];
  const report = await runValidation({ ...f.options, checks });
  assert.deepEqual(report.entries.map(e => e.status), ['passed', 'failed', 'skipped', 'blocked']);
  assert.deepEqual(report.summary, { passed: 1, failed: 1, skipped: 1, blocked: 1 });
  assert.equal(report.code, 1);
  assert.equal(report.complete, false);
  assert.deepEqual(JSON.parse(readFileSync(f.options.reportPath, 'utf8')), report);
  assert.equal((await runValidation({ ...f.options, checks: [pass] })).code, 0);
  writeFileSync(pass.command[1], 'process.exit(3);', 'utf8');
  assert.equal((await runValidation({ ...f.options, checks: [pass] })).code, 1);
  assert.equal((await runValidation({ ...f.options, checks: [checks[3]] })).code, 2);
  assert.equal((await runValidation({ ...f.options, checks: [checks[2]] })).code, 2);
});

test('timeout kills the owned child and grandchild within a bounded duration', async () => {
  const f = fixture();
  const pidFile = join(f.dir, 'pids.json');
  const check = f.check('tree', `import { spawn } from 'node:child_process';
    import { writeFileSync } from 'node:fs';
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit', windowsHide: true });
    writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify([process.pid, child.pid]));
    setInterval(() => {}, 1000);`, { timeoutMs: 1500 });
  const start = Date.now();
  const report = await runValidation({ ...f.options, checks: [check] });
  const pids = JSON.parse(readFileSync(pidFile, 'utf8'));
  // Also reap fixture processes if the host denies the runner's tree cleanup.
  if (report.entries[0].cleanup !== 'completed') for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  assert.equal(report.code, 1);
  assert.equal(report.entries[0].status, 'failed');
  assert.match(report.entries[0].reason, /Timed out/);
  assert.equal(report.entries[0].cleanup, 'completed');
  assert.ok(Date.now() - start < 13000);
  for (let i = 0; i < 50 && pids.some(alive); i++) await delay(50);
  assert.deepEqual(pids.map(alive), [false, false]);
});

test('interruption persists partial outcomes, stops the tree, and never starts remaining checks', async () => {
  const f = fixture();
  const ready = join(f.dir, 'ready');
  const marker = join(f.dir, 'unexpected');
  const controller = new AbortController();
  const checks = [f.check('first', 'process.exit(3);'), f.check('sleep', `import { writeFileSync } from 'node:fs';
    writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setInterval(() => {}, 1000);`),
  f.check('later', `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'bad');`)];
  const pending = runValidation({ ...f.options, checks, signal: controller.signal });
  await waitFor(ready);
  const partial = JSON.parse(readFileSync(f.options.reportPath, 'utf8'));
  assert.equal(partial.code, 2); assert.equal(partial.complete, false);
  controller.abort();
  const report = await pending;
  assert.equal(report.code, 2); assert.equal(report.interrupted, true);
  assert.deepEqual(report.entries.map(e => e.status), ['failed', 'blocked', 'blocked']);
  assert.equal(existsSync(marker), false);
  assert.equal(alive(Number(readFileSync(ready, 'utf8'))), false);
  assert.deepEqual(JSON.parse(readFileSync(f.options.reportPath, 'utf8')), report);
});

test('output is capped and excess cannot become a pass', async () => {
  const f = fixture();
  const check = f.check('noisy', 'console.log("x".repeat(20000));', { outputLimit: 1024 });
  const report = await runValidation({ ...f.options, checks: [check] });
  assert.equal(report.code, 1);
  const evidence = report.entries[0].evidence;
  assert.ok(statSync(evidence.stdout).size + statSync(evidence.stderr).size <= 1024);
});

test('an exited child cannot hold validation open through inherited output handles', async () => {
  const f = fixture();
  const pidFile = join(f.dir, 'descendant');
  const check = f.check('inherited-output', `import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'inherit', windowsHide: true });
    writeFileSync(${JSON.stringify(pidFile)}, String(child.pid)); child.unref();`);
  const start = Date.now();
  try {
    const report = await runValidation({ ...f.options, checks: [check] });
    assert.equal(report.code, 0);
    assert.ok(Date.now() - start < 2500);
  } finally {
    if (existsSync(pidFile)) { try { process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGKILL'); } catch {} }
  }
});

test('nested F138/F139 entries survive and incomplete or missing reports cannot pass', async () => {
  const f = fixture();
  const path = join(f.dir, 'nested.json');
  const nested = [{ id: 'native-loading', status: 'skipped', reason: 'Offline only', command: [], code: null, evidence: {} },
    { id: 'fixture', status: 'passed', reason: 'Stub assertions passed', command: [], code: 0, evidence: {} }];
  const make = entries => f.check('nested', `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(path)}, ${JSON.stringify(JSON.stringify({ entries }))});`, { report: path });
  const report = await runValidation({ ...f.options, checks: [make(nested)] });
  assert.equal(report.code, 0); assert.deepEqual(report.entries[0].entries, nested);
  assert.equal((await runValidation({ ...f.options, checks: [make(nested.slice(0, 1))] })).code, 2);
  assert.equal((await runValidation({ ...f.options, checks: [make([{ ...nested[1], status: 'failed' }])] })).code, 1);
  assert.equal((await runValidation({ ...f.options, checks: [f.check('missing-report', '', { report: join(f.dir, 'missing.json') })] })).code, 2);
});

test('fixed registry covers existing gates, preserves realistic budgets and never opts into live Codex', () => {
  const f = fixture();
  const checks = registry(f.dir, f.dir);
  assert.equal(new Set(checks.map(c => c.id)).size, checks.length);
  for (const id of ['routing', 'manifests', 'board', 'context', 'grayskull-sync', 'taskwork-selftest', 'installer-shell', 'installer-powershell', 'reliability-parity', 'codex-offline', 'ops-application']) assert.ok(checks.some(c => c.id === id), id);
  assert.ok(checks.find(c => c.id === 'installer-shell').timeoutMs >= 25 * 60000);
  assert.ok(checks.find(c => c.id === 'codex-offline').command.includes('--offline'));
  assert.ok(checks.every(c => !c.command.includes('--live')));
  const generator = checks.find(c => c.id === 'generated-commands');
  assert.equal(generator.optional, true);
  const real = registry(fileURLToPath(new URL('../../../', import.meta.url)), f.dir);
  for (const check of real.filter(c => c.id !== 'generated-commands')) {
    assert.ok(existsSync(check.cwd), check.id + ' working directory');
    for (const path of check.prerequisites || []) assert.ok(existsSync(join(check.cwd, path)), check.id + ': ' + path);
  }
});

test('child runtime preserves non-Windows environments and explicitly blocks missing Windows POSIX tools', async () => {
  const source = { PATH: '/usr/bin:/bin', PRIVATE_FIXTURE: 'do-not-report' };
  assert.deepEqual(childEnvironment(source, 'linux'), { env: source });
  assert.notEqual(childEnvironment(source, 'linux').env, source);
  assert.match(childEnvironment({ Path: '' }, 'win32').error, /sh.exe not found/);
  if (process.platform !== 'win32') return;
  const f = fixture();
  const dir = join(f.dir, 'incomplete POSIX'); mkdirSync(dir);
  writeFileSync(join(dir, 'sh.exe'), 'fixture');
  assert.match(childEnvironment({ Path: dir }).error, /utilities unavailable/);
  for (const name of ['sort', 'grep', 'sed', 'awk']) writeFileSync(join(dir, name + '.exe'), 'fixture');
  assert.match(childEnvironment({ Path: dir }).error, /sort probe failed/);
  const report = await runValidation({ ...f.options, env: { Path: '', PRIVATE_FIXTURE: 'do-not-report' }, checks: [f.check('blocked-posix', 'throw Error("must not launch")', { posix: true })] });
  assert.equal(report.code, 2); assert.equal(report.entries[0].status, 'blocked');
  assert.match(report.entries[0].reason, /sh.exe not found/);
  assert.equal(JSON.stringify(report).includes('do-not-report'), false);
});

test('Windows board selftest survives system32 sort preceding Git without changing parent PATH', { skip: process.platform !== 'win32' ? 'Windows utility collision only' : false }, async () => {
  const f = fixture();
  const keys = Object.keys(process.env).filter(key => key.toLowerCase() === 'path');
  const inheritedPath = process.env[keys.sort()[0]];
  const env = { ...process.env };
  for (const key of keys) delete env[key];
  env.Path = join(process.env.SystemRoot, 'System32') + ';' + inheritedPath;
  const originalPath = env.Path;
  const runtime = childEnvironment(env);
  assert.equal(runtime.error, undefined);
  assert.notEqual(runtime.env.Path, env.Path);
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const check = registry(root, f.dir).find(check => check.id === 'board-selftest');
  const report = await runValidation({ ...f.options, env, checks: [check] });
  assert.equal(report.code, 0, JSON.stringify(report));
  assert.equal(report.entries[0].status, 'passed');
  assert.equal(env.Path, originalPath);
  assert.equal(process.env[keys.sort()[0]], inheritedPath);
});
