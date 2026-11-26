import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./queue.mjs', import.meta.url));
const boardText = '\uFEFF# TICKETS\r\n\r\n- [ ] B1 — Installer crash [app: desktop, installer] [src: tester] [owner: @sher] [severity: high] [release: R2] [depends-on: B7, F2]\r\n- [%] B2 — Startup flicker [priority: P5] [app: installer] [src: tester]\n- [x] B3 — Closed bug [app: installer]\r\n  - [ ] F7a — Child [owner: @other] (testing: fixture)\r\n- [~] F8 (was F4) — Previous release [priority: P1] [release: R1]';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'queue-jarvis-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd }).status, 0);
  const board = join(cwd, 'TICKETS.md');
  writeFileSync(board, boardText);
  return { cwd, board };
}

function run(cwd, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}

function preview(cwd, ...args) {
  const result = run(cwd, 'preview', ...args);
  assert.equal(result.status, 0, result.stderr);
  const token = result.stdout.match(/^Preview token: ([a-f0-9]{64})$/m)?.[1];
  assert.ok(token, result.stdout);
  return { token, stdout: result.stdout };
}

test('Queue Jarvis orders open work by priority and filters ticket metadata', t => {
  const { cwd } = fixture(t);
  const all = run(cwd, 'list');
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /F8[\s\S]+B2[\s\S]+B1[\s\S]+F7a/);
  assert.doesNotMatch(all.stdout, /B3|\[app:|\[priority:/);
  const filtered = run(cwd, 'list', 'app=INSTALLER', 'src=Tester', 'owner=@SHER', 'type=bug',
    'severity=high', 'release=r2', 'depends-on=f2');
  assert.equal(filtered.status, 0, filtered.stderr);
  assert.match(filtered.stdout, /B1.*Installer crash/);
  assert.doesNotMatch(filtered.stdout, /B2|B3|F7a|F8/);
  const closed = run(cwd, 'list', 'status=done');
  assert.equal(closed.status, 0, closed.stderr);
  assert.match(closed.stdout, /B3.*Closed bug/);
});

test('preview is read-only and approved bulk apply edits just priority tags', t => {
  const { cwd, board } = fixture(t);
  const first = preview(cwd, 'P1', 'app=installer', 'src=tester');
  assert.match(first.stdout, /B1.*Unranked.*P1/i);
  assert.match(first.stdout, /B2.*P5.*P1/);
  assert.equal(readFileSync(board, 'utf8'), boardText);
  assert.equal(preview(cwd, 'P1', 'SRC=TESTER', 'app=installer').token, first.token);
  const applied = run(cwd, 'apply', first.token, 'P1', 'app=installer', 'src=tester');
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(readFileSync(board, 'utf8'), boardText.replace('[src: tester] [owner:', '[src: tester] [priority: P1] [owner:').replace('[priority: P5]', '[priority: P1]'));
  assert.equal(existsSync(`${board}.lock`), false);
  assert.notEqual(run(cwd, 'apply', first.token, 'P1', 'app=installer', 'src=tester').status, 0);
  assert.doesNotMatch(run(cwd, 'preview', 'P1', 'app=installer', 'src=tester').stdout, /Preview token:/);
});

test('apply refuses changed rule, stale board and the existing shared lock', t => {
  const { cwd, board } = fixture(t);
  const { token } = preview(cwd, 'P2', 'app=installer');
  assert.notEqual(run(cwd, 'apply', token, 'P3', 'app=installer').status, 0);
  assert.notEqual(run(cwd, 'apply', token, 'P2', 'app=desktop').status, 0);
  writeFileSync(`${board}.lock`, '321 ps1\n');
  const locked = run(cwd, 'apply', token, 'P2', 'app=installer');
  assert.notEqual(locked.status, 0);
  assert.match(locked.stderr, /locked/i);
  assert.equal(readFileSync(`${board}.lock`, 'utf8'), '321 ps1\n');
  rmSync(`${board}.lock`);
  writeFileSync(board, `${boardText}\n# Other change\n`);
  assert.match(run(cwd, 'apply', token, 'P2', 'app=installer').stderr, /preview/i);
  assert.equal(readFileSync(board, 'utf8'), `${boardText}\n# Other change\n`);
  assert.notEqual(run(cwd, 'preview', 'P1').status, 0);
  assert.notEqual(run(cwd, 'preview', 'P1', 'app=').status, 0);
  assert.notEqual(run(cwd, 'preview', 'P1', 'unknown=installer').status, 0);
});

test('automatic priorities preview matching unranked open tickets and save the same plan', t => {
  const { cwd, board } = fixture(t);
  const rows = [
    '- [ ] F1 — Critical feature [app: installer] [src: tester] [owner: @sher] [severity: critical]',
    '- [ ] B2 — Untriaged bug [app: installer] [src: tester] [owner: @sher]',
    '- [~] F3 — Active feature [app: installer] [src: tester] [owner: @sher]',
    '- [ ] A4 — Follow-up [app: installer] [src: tester] [owner: @sher]',
    '- [v] B5 — Verified [app: installer] [src: tester] [owner: @sher]',
    '- [ ] B6 — Already ranked [app: installer] [src: tester] [owner: @sher] [priority: P4]',
    '- [x] B7 — Closed [app: installer] [src: tester] [owner: @sher]',
    '- [>] B8 — Deferred [app: installer] [src: tester] [owner: @sher]',
    '- [ ] B9 — Other owner [app: installer] [src: tester] [owner: @other]',
    '- [ ] B10 — Other app [app: ops board] [src: tester] [owner: @sher]',
  ];
  const original = rows.join('\r\n') + '\r\n';
  writeFileSync(board, original);
  const selectors = ['app=installer', 'src=tester', 'owner=@sher'];
  const preview = run(cwd, 'auto-preview', ...selectors);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /5 ticket\(s\) would change/);
  assert.match(preview.stdout, /P1: 1 · P2: 1 · P3: 1 · P4: 1 · P5: 1/);
  for (const [index, id] of ['F1', 'B2', 'F3', 'A4', 'B5'].entries()) {
    assert.match(preview.stdout, new RegExp(`^${id} +Unranked -> P${index + 1} `, 'm'));
  }
  assert.doesNotMatch(preview.stdout, /^(B6|B7|B8|B9|B10) /m);
  assert.equal(readFileSync(board, 'utf8'), original);
  const token = preview.stdout.match(/^Preview token: ([a-f0-9]{64})$/m)?.[1];
  assert.ok(token);
  assert.match(run(cwd, 'auto-apply', token, 'app=installer', 'owner=@sher').stderr, /new preview/i);
  assert.match(run(cwd, 'auto-preview', 'app=ops board').stdout, /^B10 +Unranked -> P2 /m);
  const applied = run(cwd, 'auto-apply', token, ...selectors.toReversed());
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /5 ticket\(s\) assigned a priority/);
  const expected = rows.map((row, i) => i < 5 ? row.replace('[src: tester]', `[src: tester] [priority: P${i + 1}]`) : row);
  assert.equal(readFileSync(board, 'utf8'), expected.join('\r\n') + '\r\n');
  assert.doesNotMatch(run(cwd, 'auto-preview', ...selectors).stdout, /Preview token:/);
  assert.match(run(cwd, 'auto-apply', token, ...selectors).stderr, /new preview/i);
});

test('a selector applies to more than ten tickets from a linked checkout', t => {
  const { cwd, board } = fixture(t);
  const tickets = Array.from({ length: 12 }, (_, index) => `- [ ] F${index + 40} — Item ${index + 1} [app: docs]`).join('\n');
  writeFileSync(board, `${tickets}\n`);
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('add', 'TICKETS.md');
  git('-c', 'user.name=Queue Jarvis Test', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=.git/queue-jarvis-test-hooks', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture');
  const head = git('rev-parse', 'HEAD');
  const linked = join(cwd, 'linked checkout');
  git('worktree', 'add', '-q', '--detach', linked);
  const linkedBoard = join(linked, 'TICKETS.md');
  const originalLinked = readFileSync(linkedBoard, 'utf8');
  const { token, stdout } = preview(linked, 'P2', 'app=docs');
  assert.match(stdout, /12 ticket\(s\) would change/);
  const applied = run(linked, 'apply', token, 'P2', 'app=docs');
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(readFileSync(board, 'utf8').match(/\[priority: P2\]/g)?.length, 12);
  assert.equal(readFileSync(linkedBoard, 'utf8'), originalLinked);
  writeFileSync(linkedBoard, originalLinked.replace('- [ ] F40', '- [x] F40'));
  const before = readFileSync(board, 'utf8');
  const single = run(linked, '--current-worktree', 'preview', 'P5', 'id=F40');
  assert.equal(single.status, 0, single.stderr);
  assert.match(single.stdout, /1 ticket\(s\) would change/);
  const localToken = /Preview token: ([a-f0-9]{64})/.exec(single.stdout)?.[1];
  assert.ok(localToken);
  const local = run(linked, '--current-worktree', 'apply', localToken, 'P5', 'id=F40');
  assert.equal(local.status, 0, local.stderr);
  assert.equal(readFileSync(linkedBoard, 'utf8'), originalLinked.replace('- [ ] F40 — Item 1 [app: docs]', '- [x] F40 — Item 1 [app: docs] [priority: P5]'));
  assert.equal(readFileSync(board, 'utf8'), before);
  assert.equal(git('rev-parse', 'HEAD'), head);
});
