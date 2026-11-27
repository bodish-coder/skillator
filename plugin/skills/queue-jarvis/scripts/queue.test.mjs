import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const rulesBoard = [
  '- [ ] B1 — Crash in a [app: a] [severity: low]',
  '- [ ] B2 — Crash in d [app: d]',
  '- [ ] F3 — Feature in c [app: c, a] [priority: P3]',
  '- [ ] F4 — Feature in a [app: a] [severity: critical] [priority: P1]',
  '- [~] A5 — Follow-up [app: b] [priority: P4]',
  '- [x] B6 — Closed bug [app: a]',
  '- [ ] B7 — Bug in b [app: b] [priority: P2]',
].join('\n') + '\n';
const rulesFile = cwd => join(cwd, '.skillator', 'priority-rules.md');
const revisionOf = stdout => stdout.match(/^Rules revision: ([a-f0-9]{64})$/m)?.[1];
function ruled(t) {
  const { cwd, board } = fixture(t);
  writeFileSync(board, rulesBoard);
  for (const rule of [['P1', 'type=bug', 'app=a,b,c'], ['P1', 'type=feature', 'app=c'], ['P1', 'severity=critical'], ['P2', 'app=b']]) {
    const added = run(cwd, 'rules', 'add', ...rule);
    assert.equal(added.status, 0, added.stderr);
  }
  return { cwd, board };
}

test('rules file: grammar, comments, spaces in values and invalid lines', t => {
  const { cwd } = fixture(t);
  const empty = run(cwd, 'rules', 'list');
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /^0 rule\(s\)\.$/m);
  assert.ok(revisionOf(empty.stdout));
  assert.equal(existsSync(rulesFile(cwd)), false);
  mkdirSync(join(cwd, '.skillator'));
  const text = '\uFEFF# Priority rules\r\n\r\n- p1: Type=Bug  app=A, b ,c\r\n* P2: release=Next release app=ops board,web\r\n'
    + 'P3: type=bug\r\n- P2: colour=red\r\n- P2: app=a app=b\r\n- P9: app=a\r\n- P2: status=open\r\n';
  writeFileSync(rulesFile(cwd), text);
  const listed = run(cwd, 'rules', 'list');
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /^2 rule\(s\)\.$/m);
  assert.match(listed.stdout, /^1  P1: type=bug app=a,b,c$/m);
  assert.match(listed.stdout, /^2  P2: release=next release app=ops board,web$/m);
  for (const line of [5, 6, 7, 8, 9]) assert.match(listed.stdout, new RegExp(`^Invalid line ${line}: .+`, 'm'));
  assert.match(listed.stdout, /^Invalid line 6: Unknown field colour\./m);
  assert.match(listed.stdout, /^Invalid line 7: Field app is repeated\./m);
  assert.match(listed.stdout, /^Invalid line 9: Unknown status: open/m);
  assert.match(listed.stdout.trimEnd().split('\n').at(-1), /^Rules revision: [a-f0-9]{64}$/);
  assert.notEqual(revisionOf(listed.stdout), revisionOf(empty.stdout));
  const blocked = run(cwd, 'rules', 'preview');
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /Fix line 5 of \.skillator[\\/]priority-rules\.md before applying rules/);
  assert.equal(readFileSync(rulesFile(cwd), 'utf8'), text);
});

test('rules add, edit and remove change one line and keep the rest', t => {
  const { cwd } = fixture(t);
  const added = run(cwd, 'rules', 'add', 'p1', 'TYPE=bug', 'app=A, b,c');
  assert.equal(added.status, 0, added.stderr);
  assert.match(added.stdout, /Rule added\n1  P1: type=bug app=a,b,c\nRules revision: [a-f0-9]{64}\n$/);
  const created = readFileSync(rulesFile(cwd), 'utf8');
  assert.match(created, /^# Priority rules\n# One rule per line:/);
  assert.ok(created.endsWith('- P1: type=bug app=a,b,c\n'));
  writeFileSync(rulesFile(cwd), created.replace(/\n/g, '\r\n') + '\r\n# keep me\r\nnot a rule\r\n  - P3: release=next release');
  assert.equal(run(cwd, 'rules', 'add', 'P2', 'severity=high').status, 0);
  const before = run(cwd, 'rules', 'list').stdout;
  assert.match(before, /^1  P1: type=bug app=a,b,c$/m);
  assert.match(before, /^2  P3: release=next release$/m);
  assert.match(before, /^3  P2: severity=high$/m);
  assert.match(before, /^Invalid line \d+: .*\| not a rule$/m);
  const edited = run(cwd, 'rules', 'edit', '2', 'P4', 'release=next release', 'owner=@Sher', '--rev', revisionOf(before));
  assert.equal(edited.status, 0, edited.stderr);
  assert.match(edited.stdout, /Rule updated\n2  P4: release=next release owner=@sher\n/);
  const removed = run(cwd, 'rules', 'remove', '1', '--rev', revisionOf(edited.stdout));
  assert.equal(removed.status, 0, removed.stderr);
  assert.match(removed.stdout, /Rule removed\nP1: type=bug app=a,b,c\n/);
  const after = readFileSync(rulesFile(cwd), 'utf8');
  assert.ok(after.includes('\r\n# keep me\r\nnot a rule\r\n  - P4: release=next release owner=@sher\r\n- P2: severity=high\r\n'));
  assert.doesNotMatch(after, /^- P1: type=bug/m); // the header comment also says "type=bug"
  assert.doesNotMatch(after, /[^\r]\n/);
  assert.equal(existsSync(`${rulesFile(cwd)}.lock`), false);
});

test('rules remove of an unterminated last line keeps the previous line end', t => {
  const { cwd } = fixture(t);
  assert.equal(run(cwd, 'rules', 'add', 'P1', 'type=bug').status, 0);
  writeFileSync(rulesFile(cwd), readFileSync(rulesFile(cwd), 'utf8').replace(/\n/g, '\r\n') + '- P2: severity=high');
  const removed = run(cwd, 'rules', 'remove', '2');
  assert.equal(removed.status, 0, removed.stderr);
  assert.ok(readFileSync(rulesFile(cwd), 'utf8').endsWith('\r\n- P1: type=bug\r\n'));
});

test('rules edits refuse a stale revision, a duplicate and the lock', t => {
  const { cwd } = ruled(t);
  const original = readFileSync(rulesFile(cwd), 'utf8');
  const duplicate = run(cwd, 'rules', 'add', 'P1', 'app=c,b,a', 'type=BUG');
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /already exists \(rule 1\)/);
  assert.match(run(cwd, 'rules', 'remove', '1', '--rev', 'a'.repeat(64)).stderr, /The rules changed\. Reload them and try again\./);
  assert.match(run(cwd, 'rules', 'remove', '9').stderr, /No rule 9\./);
  assert.notEqual(run(cwd, 'rules', 'add', 'P1').status, 0);
  assert.notEqual(run(cwd, 'rules', 'add', 'P6', 'app=a').status, 0);
  assert.notEqual(run(cwd, 'rules', 'add', 'P1', 'app=').status, 0);
  assert.notEqual(run(cwd, 'rules', 'add', 'P1', 'type=story').status, 0);
  assert.notEqual(run(cwd, 'rules', 'preview', 'app=a').status, 0);
  writeFileSync(`${rulesFile(cwd)}.lock`, '321 other\n');
  assert.match(run(cwd, 'rules', 'add', 'P5', 'app=z').stderr, /locked/i);
  assert.equal(readFileSync(`${rulesFile(cwd)}.lock`, 'utf8'), '321 other\n');
  assert.equal(readFileSync(rulesFile(cwd), 'utf8'), original);
});

test('rules preview ranks matching open tickets, highest level wins', t => {
  const { cwd, board } = ruled(t);
  const shown = run(cwd, 'rules', 'preview');
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /^4 ticket\(s\) would change\.$/m);
  assert.match(shown.stdout, /^P1: 3 · P2: 1 · P3: 0 · P4: 0 · P5: 0$/m);
  assert.match(shown.stdout, /^B1 +Unranked +-> P1 +rule 1 +Crash in a$/m);
  assert.match(shown.stdout, /^F3 +P3 +-> P1 +rule 2 +Feature in c$/m);
  assert.match(shown.stdout, /^A5 +P4 +-> P2 +rule 4 +Follow-up$/m);
  assert.match(shown.stdout, /^B7 +P2 +-> P1 +rule 1 +Bug in b$/m);
  assert.doesNotMatch(shown.stdout, /^(B2|F4|B6) /m);
  assert.match(shown.stdout, /^Preview token: [a-f0-9]{64}$/m);
  assert.equal(readFileSync(board, 'utf8'), rulesBoard);
  assert.equal(run(cwd, 'rules', 'add', 'P5', 'status=done', 'id=B6').status, 0);
  assert.match(run(cwd, 'rules', 'preview').stdout, /^B6 +Unranked +-> P5 +rule 5 +Closed bug$/m);
  const none = fixture(t);
  assert.match(run(none.cwd, 'rules', 'preview').stderr, /No priority rules yet\. Add one: rules add P1 type=bug/);
});

test('rules apply writes the previewed plan and refuses a stale token', t => {
  const { cwd, board } = ruled(t);
  const token = run(cwd, 'rules', 'preview').stdout.match(/^Preview token: ([a-f0-9]{64})$/m)?.[1];
  assert.ok(token);
  assert.equal(run(cwd, 'rules', 'add', 'P3', 'app=d').status, 0);
  assert.match(run(cwd, 'rules', 'apply', token).stderr, /The board or rule changed\. Run a new preview before applying\./);
  assert.equal(readFileSync(board, 'utf8'), rulesBoard);
  const fresh = run(cwd, 'rules', 'preview').stdout;
  assert.match(fresh, /^5 ticket\(s\) would change\.$/m);
  const next = fresh.match(/^Preview token: ([a-f0-9]{64})$/m)?.[1];
  writeFileSync(`${board}.lock`, '321 ps1\n');
  assert.match(run(cwd, 'rules', 'apply', next).stderr, /locked/i);
  rmSync(`${board}.lock`);
  const applied = run(cwd, 'rules', 'apply', next);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /^5 ticket\(s\) updated by the priority rules\.$/m);
  assert.equal(readFileSync(board, 'utf8'), rulesBoard
    .replace('[app: a] [severity: low]', '[app: a] [priority: P1] [severity: low]')
    .replace('B2 — Crash in d [app: d]', 'B2 — Crash in d [app: d] [priority: P3]')
    .replace('[app: c, a] [priority: P3]', '[app: c, a] [priority: P1]')
    .replace('[app: b] [priority: P2]', '[app: b] [priority: P1]')        // B7 first: A5 becomes P2 on the next line
    .replace('[app: b] [priority: P4]', '[app: b] [priority: P2]'));
  assert.equal(existsSync(`${board}.lock`), false);
  assert.doesNotMatch(run(cwd, 'rules', 'preview').stdout, /Preview token:/);
  assert.notEqual(run(cwd, 'rules', 'apply', next).status, 0);
});

test('rules add and edit refuse a value that holds whitespace then word=', t => {
  const { cwd } = ruled(t);
  const before = readFileSync(rulesFile(cwd), 'utf8');
  for (const condition of ['release=q3 scope=wide', 'release=v2 type=bug', 'app=a\tb=c']) {
    const added = run(cwd, 'rules', 'add', 'P3', condition);
    assert.equal(added.status, 1, condition);
    assert.match(added.stderr, /^Queue Jarvis: .*cannot contain whitespace followed by word=/m);
    const edited = run(cwd, 'rules', 'edit', '1', 'P3', 'app=a', condition);
    assert.equal(edited.status, 1, condition);
    assert.match(edited.stderr, /^Queue Jarvis: .*cannot contain whitespace followed by word=/m);
  }
  assert.equal(readFileSync(rulesFile(cwd), 'utf8'), before);
  assert.equal(run(cwd, 'rules', 'add', 'P3', 'release=next release').status, 0);
});

test('rules match any comma-separated part of a ticket tag value on every field', t => {
  const { cwd, board } = fixture(t);
  writeFileSync(board, [
    '- [ ] F1 — Two releases [release: 1.0, 1.1]',
    '- [ ] F2 — Two owners [owner: Asha, Ben]',
    '- [ ] F3 — Other release [release: 2.0]',
  ].join('\n') + '\n');
  assert.equal(run(cwd, 'rules', 'add', 'P2', 'release=1.1').status, 0);
  assert.equal(run(cwd, 'rules', 'add', 'P3', 'owner=asha').status, 0);
  const shown = run(cwd, 'rules', 'preview');
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /^F1 +Unranked +-> P2 +rule 1 +Two releases$/m);
  assert.match(shown.stdout, /^F2 +Unranked +-> P3 +rule 2 +Two owners$/m);
  assert.doesNotMatch(shown.stdout, /^F3 /m);
  assert.equal(run(cwd, 'list', 'release=1.1').stdout.includes('F1'), false);
});
