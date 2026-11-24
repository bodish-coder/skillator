import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const windows = process.platform === 'win32';
const bash = process.env.SKILLATOR_TEST_BASH ?? (windows ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const script = name => fileURLToPath(new URL(name, import.meta.url)).replaceAll('\\', '/');
const shell = [bash, '-c', 'PATH="/usr/bin:$PATH"; export PATH; exec sh "$@"', 'ticket-meta-test'];
const adapters = [['Bash', [...shell, script('../scripts/ticket-meta.sh')]]];
if (windows) adapters.push(['PowerShell', ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script('../scripts/ticket-meta.ps1')]]);

for (const [name, [exe, ...base]] of adapters) test(`${name}: ticket app preservation, mapped paths and source metadata`, t => {
  const cwd = mkdtempSync(join(tmpdir(), 'ticket-app-src-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  function run(bin, args, expected = 0) {
    const r = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: 30000 });
    assert.ifError(r.error);
    assert.equal(r.status, expected, `${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
    return r.stdout.trim();
  }
  const git = (...args) => run('git', args);
  const meta = (...args) => run(exe, [...base, ...args]);
  const board = () => readFileSync(join(cwd, 'TICKETS.md'), 'utf8');
  const put = (path, text) => writeFileSync(join(cwd, path), text);
  git('init', '-q');
  git('config', 'user.name', 'Ticket Test');
  git('config', 'user.email', 'test@example.test');
  git('config', 'core.hooksPath', '.git/no-hooks');
  for (const path of ['apps/web/detail', 'apps/web/other', 'tools', '.skillator']) mkdirSync(join(cwd, path), { recursive: true });
  put('TICKETS.md', '# TICKETS\n\n- [ ] F1 - Preserve [app: Hand-set] [owner: @owner]\n- [ ] F2 - Infer [owner: @owner]\n- [ ] F3 - Mapped commit\n');
  put('apps/web/detail/actions.js', 'detail\n');
  put('apps/web/other/item.js', 'other\n');
  put('tools/report_daily.js', 'report\n');
  git('add', '.');
  git('commit', '-qm', 'F1 F2 fixture workspace');
  put('tools/report_daily.js', 'changed report\n');
  git('add', 'tools/report_daily.js');
  git('commit', '-qm', 'F3 report only');

  assert.match(meta('tag', 'F1'), /\[app: Hand-set\]/);
  assert.match(meta('done', 'F1', 'fixture verified'), /\[x\].*\[app: Hand-set\]/);
  assert.match(meta('tag', '--force-app', 'F1'), /\[app: web\]/);
  assert.match(meta('tag', 'F2'), /\[app: web\]/);
  assert.equal(meta('apps-of', 'F3'), '');

  put('.skillator/apps.map', '# Local app names\napps/web/d=Broad\napps/web/detail/=Detail\napps/web/detail/=Duplicate\ntools/report_=Reports\n');
  assert.equal(meta('app-of', 'apps/web/detail/actions.js'), 'Detail');
  assert.equal(meta('app-of', 'apps/web/other/item.js'), 'web');
  assert.equal(meta('apps-of', 'F3'), 'Reports');
  assert.deepEqual(meta('apps').split(/\r?\n/), ['web', 'Broad', 'Detail', 'Reports']);

  assert.match(meta('src', 'F2', 'test runner'), /\[app: web\] \[src: test runner\]/);
  assert.match(meta('src', 'F2', 'tester'), /\[app: web\] \[src: tester\] \[owner: @owner\]/);
  assert.match(meta('src', 'F3', 'owner'), /Mapped commit \[src: owner\]/);
  assert.equal(board().match(/\[src: tester\]/g)?.length, 1);
  const before = board();
  const r = spawnSync(exe, [...base, 'src', 'F2', 'invalid]'], { cwd, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.equal(board(), before);
});

test('ticket title checker excludes source metadata', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'ticket-source-title-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const file = join(cwd, 'TICKETS.md');
  writeFileSync(file, `- [ ] F1 - ${'X'.repeat(60)} [src: ${'Y'.repeat(80)}]\n`);
  const r = spawnSync(bash, [...shell.slice(1), script('../../../practice/scripts/check-tickets.sh'), file.replaceAll('\\', '/')], { cwd, encoding: 'utf8' });
  assert.ifError(r.error);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /WARN: F1 title is /);
});
