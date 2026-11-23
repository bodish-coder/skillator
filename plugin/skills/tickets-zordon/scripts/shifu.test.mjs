import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { combine, configureApps, listApps, report, runApp, selectTickets, snapshot, storeResult } from './shifu.mjs';
import registerShifuCompletion, { shifuSuggestions } from './shifu-pi.mjs';

const board = '- [%] F190 — Testing. Done = run checks.\n- [v] F191 — Verified. Done = inspect behavior.\n- [x] F192 — Done.\n';

function project(t) {
  const repo = mkdtempSync(join(tmpdir(), 'shifu-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  writeFileSync(join(repo, 'TICKETS.md'), board);
  git(repo, 'init', '-q');
  return repo;
}

function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('select defaults to Testing for verify and Testing plus Verified for analyse', () => {
  assert.deepEqual(selectTickets(board, 'verify').eligible, ['F190', 'F191']);
  assert.deepEqual(selectTickets(board, 'verify').tickets.map(row => row.id), ['F190']);
  assert.deepEqual(selectTickets(board, 'analyse').eligible, ['F190', 'F191']);
  const selected = selectTickets(board, 'analyse', ['F191', 'F192', 'F191']);
  assert.deepEqual(selected.tickets.map(row => row.id), ['F191']);
  assert.deepEqual(selected.unavailable, ['F192']);
  assert.deepEqual(selectTickets(board, 'verify', ['F191']).tickets.map(row => row.id), ['F191']);
  const children = `${board}- [%] AB190a — Child.\n- [%] AB190abc — Invalid.\n`;
  assert.deepEqual(selectTickets(children, 'verify', ['ab190a', 'AB190']).tickets.map(row => row.id), ['AB190a']);
  assert.deepEqual(selectTickets(children, 'verify', ['AB190']).unavailable, ['AB190']);
});

test('Pi completions show flags and live eligible IDs and omit supplied IDs', t => {
  const values = input => shifuSuggestions(input, board)?.items.map(item => item.value);
  assert.equal(values('/something-else '), undefined);
  assert.deepEqual(values('/verify-shifu --d'), ['--deep']);
  assert.deepEqual(values('/verify-shifu F'), ['F190', 'F191']);
  assert.deepEqual(values('/verify-shifu --deep F'), ['F190', 'F191']);
  assert.equal(values('/verify-shifu --ids F'), undefined);
  assert.equal(values('/verify-shifu F190 --'), undefined);
  assert.equal(values('/analyse-shifu --configure F'), undefined);
  assert.deepEqual(values('/analyse-shifu F190 F'), ['F191']);
  const cwd = project(t);
  const existing = { triggerCharacters: ['@'], getSuggestions: () => 'existing suggestions', shouldTriggerFileCompletion: () => false };
  let provider;
  const context = { cwd, ui: { addAutocompleteProvider: wrap => { provider = wrap(existing); } } };
  registerShifuCompletion({ on: (event, callback) => {
    assert.equal(event, 'session_start');
    callback({}, { cwd, ui: {} });
    callback({}, context);
  } });
  const partial = '/verify-shifu F';
  assert.deepEqual(provider.getSuggestions([partial], 0, partial.length).items.map(item => item.value), ['F190', 'F191']);
  const terminal = '/verify-shifu --ids ';
  assert.equal(provider.getSuggestions([terminal], 0, terminal.length), null);
  const emptyArgs = '/verify-shifu ';
  assert.equal(provider.shouldTriggerFileCompletion([emptyArgs], 0, emptyArgs.length), true);
  assert.equal(provider.shouldTriggerFileCompletion(['/other'], 0, 6), false);
  assert.equal(provider.getSuggestions(['/other'], 0, 6), 'existing suggestions');
  assert.deepEqual(provider.triggerCharacters, ['@']);
});

test('testing app choices persist, can change, and report unavailable host adapters', t => {
  const repo = project(t);
  const host = [{ id: 'local-browser', label: 'Local browser' }, { id: 'test-device', label: 'Test device' }];
  assert.deepEqual(listApps(repo, host).selected, []);
  assert.throws(() => configureApps(repo, host, ['unknown']), /currently available/);
  assert.throws(() => listApps(repo, [...host, host[0]]), /duplicate/);
  assert.deepEqual(configureApps(repo, host, ['local-browser', 'test-device']), ['local-browser', 'test-device']);
  assert.deepEqual(listApps(repo, [host[0]]).unavailable, ['test-device']);
  configureApps(repo, host, ['local-browser']);
  assert.deepEqual(listApps(repo, host).selected, ['local-browser']);
  git(repo, 'add', '.');
  git(repo, '-c', 'user.name=Shifu Test', '-c', 'user.email=shifu@example.test', 'commit', '-qm', 'Initial board');
  const worktree = join(repo, '.git', 'second-worktree');
  git(repo, 'worktree', 'add', '-q', '--detach', worktree);
  assert.deepEqual(listApps(worktree, host).selected, ['local-browser']);
});

test('local npm app tests run on each request', t => {
  const repo = project(t);
  const packageDir = join(repo, 'packages', 'example');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ scripts: { test: 'node check.cjs' } }));
  writeFileSync(join(packageDir, 'check.cjs'), "require('node:fs').appendFileSync('runs', 'ran\\n');");
  git(repo, 'add', 'packages/example/package.json');
  const app = listApps(repo).available.find(app => app.label === 'npm test in packages/example');
  if (!app) return t.skip('npm is unavailable');
  assert.match(app.id, /^npm-packages-example-[a-f0-9]{8}$/);
  configureApps(repo, [], [app.id]);
  assert.equal(runApp(repo, app.id).verdict, 'PASS');
  assert.equal(runApp(repo, app.id).verdict, 'PASS');
  assert.equal(readFileSync(join(packageDir, 'runs'), 'utf8'), 'ran\nran\n');
});

test('deep cache ignores board status and verdict edits and invalidates criteria or implementation changes', t => {
  const repo = project(t);
  writeFileSync(join(repo, 'impl.cjs'), 'module.exports = 1;');
  git(repo, 'add', '.');
  git(repo, '-c', 'user.name=Shifu Test', '-c', 'user.email=shifu@example.test', 'commit', '-qm', 'Implement F190');
  const base = snapshot(repo, 'F190');
  storeResult(repo, { ...base, verdict: 'PASS', evidence: 'Reviewed' });
  const registered = [{ id: 'local-browser', label: 'Local browser' }, { id: 'test-device', label: 'Test device' }];
  configureApps(repo, registered, ['local-browser', 'test-device']);
  const app = { id: 'local-browser', verdict: 'PASS', evidence: 'Fresh browser check' };
  const notApplicable = { id: 'test-device', verdict: 'N/A', evidence: 'No device requirement' };
  assert.equal(combine(repo, { id: 'F190', apps: [app, notApplicable] }).verdict, 'PASS');
  assert.equal(combine(repo, { id: 'F190', apps: [app] }).verdict, 'FAIL');
  assert.equal(combine(repo, { id: 'F190', apps: [app, notApplicable], owner: 'Owner checks hardware' }).verdict, 'OWNER');
  writeFileSync(join(repo, 'TICKETS.md'), board.replace('[%]', '[v]').replace('run checks.', 'run checks. (verified PASS 2026-01-01: Reviewed)'));
  assert.equal(snapshot(repo, 'F190').cached.verdict, 'PASS');
  report(repo, { results: [] });
  assert.equal(snapshot(repo, 'F190').identity, base.identity);
  writeFileSync(join(repo, 'TICKETS.md'), board.replace('run checks.', 'run more checks.'));
  assert.equal(snapshot(repo, 'F190').cached, null);
  writeFileSync(join(repo, 'TICKETS.md'), board);
  assert.equal(snapshot(repo, 'F190').cached.verdict, 'PASS');
  writeFileSync(join(repo, 'impl.cjs'), 'module.exports = 2;');
  assert.equal(snapshot(repo, 'F190').cached, null);
  assert.equal(combine(repo, { id: 'F190', apps: [app, notApplicable] }).verdict, 'FAIL');
  assert.throws(() => storeResult(repo, { ...base, verdict: 'PASS', evidence: 'Stale' }), /changed during/);
  writeFileSync(join(repo, 'impl.cjs'), 'module.exports = 1;');
  writeFileSync(join(repo, 'new-implementation.cjs'), 'module.exports = 3;');
  assert.equal(snapshot(repo, 'F190').cached, null);
});

test('HTML escapes evidence, reads back state, and provides offline filters and details', t => {
  const repo = project(t);
  const results = [
    { id: 'F190', verdict: 'FAIL', previous: 'Testing', state: 'Verified', evidence: '</script><img src=x>', checks: ['a & b'] },
    { id: 'F191', verdict: 'PASS', previous: 'Testing', evidence: 'browser passed' },
  ];
  const output = readFileSync(report(repo, { deep: true, results }), 'utf8');
  assert.match(output, /2 selected · 1 PASS · 1 FAIL · 0 OWNER/);
  assert.match(output, /<details data-verdict="FAIL" data-state="Testing">/);
  assert.match(output, /Testing → Verified/);
  assert.match(output, /&lt;\/script&gt;&lt;img src=x&gt;/);
  assert.match(output, /a &amp; b/);
  assert.doesNotMatch(output, /<img|<script src=/);
  const controls = Object.fromEntries(['search', 'verdict', 'state', 'visible'].map(id => [id, {
    value: '', addEventListener(_event, callback) { this.input = callback; },
  }]));
  const rows = results.map((row, index) => ({ dataset: { verdict: row.verdict, state: index === 0 ? 'Testing' : 'Verified' }, textContent: `${row.id} ${row.evidence}` }));
  runInNewContext(output.match(/<script>([\s\S]+)<\/script>/)[1], { document: {
    getElementById: id => controls[id], querySelectorAll: () => rows,
  } });
  assert.equal(controls.visible.textContent, '2 shown');
  controls.search.value = 'browser';
  controls.search.input();
  assert.deepEqual(rows.map(row => row.hidden), [true, false]);
  controls.verdict.value = 'FAIL';
  controls.verdict.input();
  assert.equal(controls.visible.textContent, '0 shown');
  controls.search.value = '';
  controls.verdict.value = '';
  controls.state.value = 'Testing';
  controls.state.input();
  assert.deepEqual(rows.map(row => row.hidden), [false, true]);
  assert.match(readFileSync(report(repo, { results: [], unavailable: ['F999'] }), 'utf8'), /0 selected · 0 PASS · 0 FAIL · 0 OWNER[\s\S]+Unavailable IDs: F999/);
});
