import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync, symlinkSync, rmdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const plugin = fileURLToPath(new URL('../../', import.meta.url));
const script = join(plugin, 'practice/scripts/generate-commands.mjs');
const contract = JSON.parse(readFileSync(new URL('./fixtures/command-contract.json', import.meta.url), 'utf8'));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'command-generation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(plugin, 'commands'), join(root, 'commands'), { recursive: true });
  cpSync(join(plugin, 'host-commands'), join(root, 'host-commands'), { recursive: true });
  return root;
}
function run(root, mode) {
  return spawnSync(process.execPath, [script, mode, '--root', root], { encoding: 'utf8' });
}
function ok(result) { assert.equal(result.status, 0, result.stdout + result.stderr); }
function metadata(root, edit) {
  const path = join(root, 'commands/hosts.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  edit(data);
  writeFileSync(path, JSON.stringify(data), 'utf8');
}

test('stale check names the path without writing; regeneration is deterministic', t => {
  const root = fixture(t);
  ok(run(root, '--write'));
  const stale = join(root, 'host-commands/cursor/skillator-pending.md');
  writeFileSync(stale, 'stale\r\n', 'utf8');
  const result = run(root, '--check');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /host-commands\/cursor\/skillator-pending\.md/);
  assert.equal(readFileSync(stale, 'utf8'), 'stale\r\n');
  ok(run(root, '--write'));
  const once = contract.outputs.map(path => readFileSync(join(root, path)));
  ok(run(root, '--write'));
  contract.outputs.forEach((path, i) => {
    const bytes = readFileSync(join(root, path));
    assert.deepEqual(bytes, once[i], path);
    assert.ok(!bytes.includes(13), path);
    assert.notEqual(bytes.toString('utf8')[0], '\uFEFF', path);
  });
  ok(run(root, '--check'));
});

test('A220: --check reports orphaned host files; --write reports them too but never deletes; litter, symlinks and case variants are ignored', t => {
  const root = fixture(t);
  ok(run(root, '--write'));
  const orphans = ['host-commands/cursor/oldname.md', 'host-commands/cursor/user.md', 'host-commands/gemini/oldname.toml', 'host-commands/antigravity/oldname/SKILL.md'];
  const ignored = ['host-commands/cursor/.DS_Store', 'host-commands/cursor/Thumbs.db', 'host-commands/cursor/desktop.ini', 'host-commands/cursor/notes.md~', 'host-commands/cursor/.notes.md.swp'];
  for (const path of [...orphans, ...ignored]) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), 'x', 'utf8');
  }
  // A case variant of an expected output is not an orphan (same bytes, so not stale either).
  const variant = 'host-commands/cursor/Team.MD';
  writeFileSync(join(root, variant), readFileSync(join(root, 'host-commands/cursor/team.md')));
  for (const mode of ['--check', '--write']) {
    const result = run(root, mode);
    assert.equal(result.status, 1, mode + result.stdout + result.stderr);
    for (const path of orphans) assert.ok(result.stderr.includes(`Orphaned generated file: ${path} (remove with: git rm ${path})`), mode + path);
    for (const path of [...ignored, variant]) assert.ok(!result.stderr.includes(path), mode + path);
    for (const path of [...orphans, ...ignored, variant]) assert.ok(existsSync(join(root, path)), mode + path);
  }
  for (const path of orphans) rmSync(join(root, path));
  ok(run(root, '--check'));
});

test('F171: only the unique command names are rendered; no plain twin is rendered or left on disk; hosts.json has no aliases', async () => {
  const { renderCommands } = await import('./generate-commands.mjs');
  const unique = ['archive-zordon', 'decision-matrix', 'engage-picard', 'list-ticket-zordon', 'gauntlet-plan', 'gauntlet-run', 'pending-sentinel',
    'skillator-pending', 'skillator-sync', 'sync-zordon', 'verify-shifu', 'skillator-ops'];
  const plain = ['archive-tickets', 'engage', 'list-tickets', 'marathon-plan', 'marathon-run', 'pending-subagent',
    'pending', 'upstream-sync', 'sync-tickets', 'verify-subagent', 'ops'];
  const outputs = [...renderCommands(plugin).keys()];
  const meta = JSON.parse(readFileSync(join(plugin, 'commands/hosts.json'), 'utf8'));
  for (const entry of meta.commands) assert.ok(!('aliases' in entry) && !('canonicalAliases' in entry), entry.name);
  const names = meta.commands.map(c => c.name);
  for (const name of unique) assert.ok(names.includes(name), `hosts.json lacks ${name}`);
  for (const old of plain) {
    assert.ok(!names.includes(old), `hosts.json still has ${old}`);
    assert.ok(!outputs.some(p => p.split('/').some(part => part.replace(/\.(md|toml)$/, '') === old)), old);
    for (const ext of ['md', 'txt']) assert.ok(!existsSync(join(plugin, `commands/${old}.${ext}`)), `commands/${old}.${ext}`);
    for (const path of [`antigravity/${old}`, `cursor/${old}.md`, `gemini/${old}.toml`, `opencode/${old}.md`, `pi/${old}.md`]) {
      assert.ok(!existsSync(join(plugin, 'host-commands', path)), path);
    }
  }
});

test('every published output has a source; host invocation contracts survive', async t => {
  const { renderCommands } = await import('./generate-commands.mjs');
  const outputs = renderCommands(plugin);
  assert.deepEqual([...outputs.keys()].filter(p => p.startsWith('host-commands/')).sort(), contract.outputs);
  for (const [host, fragments] of Object.entries(contract.hostFragments)) {
    for (const [i, name] of ['gauntlet-plan', 'gauntlet-run'].entries()) {
      const path = `host-commands/${host}/${name}${host === 'antigravity' ? '/SKILL.md' : host === 'gemini' ? '.toml' : '.md'}`;
      assert.ok(outputs.get(path).includes(fragments[i]), path);
    }
  }
  for (const [path, body] of outputs) {
    if (/skillator-update/.test(path)) {
      for (const guard of ['git -C <src> rev-parse --show-toplevel', 'git -C <checkout-root> pull --ff-only', 'never merge, reset, stash or force', 'missing Git or any other lookup error']) assert.ok(body.includes(guard), `${path}: ${guard}`);
      assert.ok(body.includes('{{SKILLS}}/.skillator-source'), path);
    }
    if (/message-uhura/.test(path)) {
      for (const guard of ['@handle <issue>', '6-Section Analysis', 'message @handle --file', 'No secrets or tokens', '/team-messages', 'local_queue_only', 'channel_posted', 'failed_post', 'acknowledged']) assert.ok(body.includes(guard), `${path}: ${guard}`);
    }
    if (/team-messages/.test(path)) {
      for (const guard of ['read-only inbox command', 'not an alias for `/message-uhura`', '/message-uhura @handle <issue>']) assert.ok(body.includes(guard), `${path}: ${guard}`);
    }
    if (/gauntlet-(plan|run)/.test(path)) {
      for (const guard of ['Legacy recovery (A162)', 'PLAN.mode', 'planned in RUN-<id>', '/gauntlet-plan <mode> <IDs>']) assert.ok(body.includes(guard), `${path}: ${guard}`);
    }
  }
  assert.match(outputs.get('host-commands/gemini/skillator-pending.toml'), /!\{sh "\{\{SKILLS\}\}/);
  assert.match(outputs.get('host-commands/gemini/code-vader.toml'), /!\{sh .* collect \{\{args\}\}/);
  assert.match(outputs.get('host-commands/pi/engage-picard.md'), /argument-hint:.*\n---\n[\s\S]*\$ARGUMENTS/);
  assert.match(outputs.get('host-commands/antigravity/engage-picard/SKILL.md'), /^---\nname: engage-picard\n/);
  assert.ok(outputs.get('host-commands/antigravity/skillator-pending/SKILL.md').includes('name: skillator-pending'));
  const hostsMeta = JSON.parse(readFileSync(join(plugin, 'commands/hosts.json'), 'utf8'));
  const tm = hostsMeta.commands.find(c => c.name === 'team-messages');
  const mu = hostsMeta.commands.find(c => c.name === 'message-uhura');
  assert.ok(tm && mu, 'team-messages and message-uhura exist as distinct commands');
  ok(run(plugin, '--check'));
});

test('canonical edits propagate and CRLF input produces LF output', t => {
  const root = fixture(t);
  const path = join(root, 'commands/engage-picard.md');
  writeFileSync(path, (readFileSync(path, 'utf8') + '\nShared new instruction.\n').replaceAll('\n', '\r\n'), 'utf8');
  ok(run(root, '--write'));
  for (const output of contract.outputs.filter(p => /engage-picard/.test(p))) {
    const text = readFileSync(join(root, output), 'utf8');
    assert.ok(text.includes('Shared new instruction.'), output);
    assert.ok(!text.includes('\r'), output);
  }
});

for (const [name, region, original] of [
  ['gauntlet-plan', 'intro', 'compute file disjointness from ticket bodies/history'],
  ['gauntlet-plan', 'workflow', 'compute file disjointness from ticket bodies and history'],
  ['gauntlet-run', 'intro', 'The count is a whole number of at least 1 or `max`'],
  ['gauntlet-run', 'workflow', 'park the owner\'s questions for one end batch'],
]) {
  test(`${name} shared ${region} edits reach every host with dispatch intact`, async t => {
    const root = fixture(t);
    const path = join(root, `commands/${name}.md`);
    const source = readFileSync(path, 'utf8');
    assert.ok(source.includes(original));
    const changed = `${original} (shared propagation sentinel)`;
    writeFileSync(path, source.replace(original, changed), 'utf8');
    const { renderCommands } = await import('./generate-commands.mjs');
    const outputs = renderCommands(root);
    for (const [host, fragments] of Object.entries(contract.hostFragments)) {
      const path = `host-commands/${host}/${name}${host === 'antigravity' ? '/SKILL.md' : host === 'gemini' ? '.toml' : '.md'}`;
      const body = outputs.get(path);
      assert.ok(body.includes(changed), `${path}: shared ${region} mutation missing`);
      assert.ok(body.includes(fragments[name === 'gauntlet-plan' ? 0 : 1]), `${path}: dispatch contract`);
    }
  });
}

test('Gemini delivery and reply parse spaced installed script paths as one argument', async t => {
  const { renderCommands } = await import('./generate-commands.mjs');
  const body = renderCommands(plugin).get('host-commands/gemini/message-uhura.toml');
  const commands = [...body.matchAll(/`(node [^`]+scripts\/team\.mjs[^`]+)`/g)].map(m => m[1]);
  assert.equal(commands.length, 2);
  const root = fixture(t);
  const installed = 'C:/Users/Example User/.gemini/skills/teams-uhura/scripts/team.mjs';
  for (const [i, template] of commands.entries()) {
    const command = template.replaceAll('{{SKILLS}}', 'C:/Users/Example User/.gemini/skills')
      .replace('@handle', 'example').replace('<path-to-temp-file>', 'message.txt');
    const expected = [installed, ...(i === 0 ? ['message', 'example'] : ['say']), '--file', 'message.txt'];
    if (process.platform === 'win32') {
      const driver = join(root, `args-${i}.ps1`);
      writeFileSync(driver, `function node { ConvertTo-Json -Compress -InputObject @($args) }\n${command}\n`, 'utf8');
      const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', driver], { encoding: 'utf8', windowsHide: true });
      ok(result);
      assert.deepEqual(JSON.parse(result.stdout), expected);
    }
    const shell = spawnSync('sh', ['-c', `node() { printf '%s\\n' "$@"; }; ${command}`], { encoding: 'utf8', windowsHide: true });
    if (shell.error?.code === 'ENOENT' && process.platform === 'win32') t.diagnostic('POSIX sh unavailable; PowerShell argument execution covered');
    else { ok(shell); assert.deepEqual(shell.stdout.trim().split(/\r?\n/), expected); }
  }
});

test('unknown substitutions and duplicate paths fail before any writes', t => {
  for (const kind of ['unknown', 'duplicate', 'section', 'traversal']) {
    const root = fixture(t);
    const stale = join(root, 'host-commands/cursor/skillator-pending.md');
    writeFileSync(stale, 'keep stale', 'utf8');
    if (kind === 'unknown') writeFileSync(join(root, 'commands/engage-picard.md'), readFileSync(join(root, 'commands/engage-picard.md'), 'utf8') + '\n{{TYPO}}\n');
    if (kind === 'duplicate') metadata(root, data => data.commands.push(data.commands[0]));
    if (kind === 'section') metadata(root, data => { data.sections['engage-picard.absent'] = { all: 'oops' }; });
    if (kind === 'traversal') metadata(root, data => { data.commands[0].name = '../escape'; });
    const result = run(root, '--write');
    assert.equal(result.status, 1, kind + result.stdout + result.stderr);
    assert.match(result.stderr, { unknown: /Unknown substitution.*TYPO/, duplicate: /Duplicate output path/, section: /Unused section metadata/, traversal: /Invalid command name/ }[kind]);
    assert.equal(readFileSync(stale, 'utf8'), 'keep stale', kind);
  }
});

test('a directory in an output path fails preflight before any writes', t => {
  const root = fixture(t);
  const stale = join(root, 'host-commands/cursor/skillator-pending.md');
  writeFileSync(stale, 'keep stale');
  const target = join(root, 'host-commands/pi/team.md');
  rmSync(target);
  mkdirSync(target);
  const result = run(root, '--write');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsafe output path/);
  assert.equal(readFileSync(stale, 'utf8'), 'keep stale');
});

test('Windows PowerShell installer writes all 18 Codex skill wrappers with exact substituted bytes', { skip: process.platform !== 'win32' ? 'Windows PowerShell writer check requires Windows' : false }, t => {
  const root = fixture(t);
  ok(run(root, '--write'));
  const driver = join(root, 'writer.ps1');
  const target = join(root, 'isolated profile', 'skills');
  writeFileSync(driver, `param($InstallerDirectory, $TemplateRoot, $Target)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $InstallerDirectory 'install.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Installer parse failure' }
foreach ($name in 'Rename-Retired', 'Remove-RetiredDir', 'Test-UnderLink', 'Write-Cmd', 'Write-Commands') {
  $fn = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)
  if (-not $fn) { throw "Missing function $name" }
  . ([scriptblock]::Create($fn.Extent.Text.Replace('$PSScriptRoot', '$TemplateRoot')))
}
$DryRun = $false
$codexHome = Split-Path -Parent $Target
Write-Commands codex $Target
`, 'utf8');
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', driver, plugin, root, target], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  ok(result);
  assert.equal(result.stderr, '');
  const paths = contract.outputs.filter(p => p.startsWith('host-commands/antigravity/'));
  assert.equal(paths.length, 18);
  for (const path of paths) {
    const actual = readFileSync(join(target, path.replace('host-commands/antigravity/', '')));
    const expected = readFileSync(join(root, path), 'utf8').replaceAll('{{SKILLS}}', target);
    assert.deepEqual(actual, Buffer.from(expected, 'utf8'), path);
  }
});

test('Shifu command descriptions, help, and workflow are current on all five generated hosts', async () => {
  const { renderCommands } = await import('./generate-commands.mjs');
  const outputs = [...renderCommands(plugin)].filter(([path]) => /\/(?:verify|analyse)-shifu(?:[./])/.test(path));
  assert.equal(outputs.length, 10);
  for (const [path, body] of outputs) {
    assert.equal(readFileSync(join(plugin, path), 'utf8'), body, path);
    for (const value of path.includes('verify-shifu')
      ? ['/verify-shifu F191', '/verify-shifu F190 F191', '/verify-shifu --deep F190 F191', '--ids', 'report <run.json>']
      : ['--configure', 'select analyse', 'combine <evidence.json>', 'report <run.json>']) {
      assert.ok(body.includes(value), `${path}: ${value}`);
    }
  }
});

test('F175: decision-matrix resolves across Claude Code and host copies; fixture board with two [?] tickets and one parked run question asks and records those three in order', async t => {
  const { renderCommands } = await import('./generate-commands.mjs');
  const outputs = renderCommands(plugin);
  const canonical = readFileSync(join(plugin, 'commands/decision-matrix.md'), 'utf8');
  const hostPaths = [
    'host-commands/cursor/decision-matrix.md',
    'host-commands/pi/decision-matrix.md',
    'host-commands/opencode/decision-matrix.md',
    'host-commands/antigravity/decision-matrix/SKILL.md',
    'host-commands/gemini/decision-matrix.toml',
  ];
  for (const body of [canonical, ...hostPaths.map(p => outputs.get(p))]) {
    assert.ok(body, 'decision-matrix body rendered');
    for (const guard of [
      '[?]',
      'queue --all',
      'engineering choices',
      'settled rulings',
      '2-4 options',
      '(Recommended)',
      'never pre-selected',
      'ticket-meta',
      'decided',
      'defer',
      'relay-morpheus',
      'answer',
    ]) {
      assert.ok(body.includes(guard), `missing guard: ${guard}`);
    }
  }

  // Fixture repo: two [?] decide tickets (F12, A7), non-question tickets ([ ] F10, [~] B4, [x] F9),
  // and an open relay run with one open parked question (Q1) and one already-answered question (Q2).
  const root = mkdtempSync(join(tmpdir(), 'f175-decision-matrix-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo').replace(/\\/g, '/');
  const bin = join(root, 'bin');
  mkdirSync(join(repo, '.skillator'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(repo, '.skillator/team.md'), '# Team\nlead: @sabre\n- @sabre: sabre@example.com\n  name: Sabre\n', 'utf8');
  writeFileSync(join(repo, 'TICKETS.md'), [
    '# Tickets',
    '',
    '## Open',
    '',
    '- [ ] F10 — Build login form [owner: @sabre]',
    '- [?] F12 — Pick auth token storage (cookie vs memory) [owner: @sabre] [decide: @sabre]',
    '- [~] B4 — Fix header alignment [owner: @sabre]',
    '- [?] A7 — Choose audit retention window (30d vs 90d) [owner: @sabre] [decide: @sabre]',
    '',
    '## Closed',
    '',
    '- [x] F9 — Settled theme ruling (decided 2026-10-01 by @sabre)',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(join(repo, '.skillator/run-0001-demo.md'), [
    '# RUN-0001 — demo',
    'goal: demo',
    'created: 2026-11-14T10:00Z',
    'updated: 2026-11-14T10:00Z',
    '',
    '## Stages',
    '| # | Stage | State | Owner | Landed |',
    '|---|---|---|---|---|',
    '| 1 | F10 | ? | - | - |',
    '',
    '## Chain',
    'hold: -',
    '',
    '### AAAA - stage 1 - F10',
    'tickets: F10',
    'files: src/auth.ts',
    'prompt: |',
    '  build F10',
    '',
    '## Decisions',
    'asks: end',
    '',
    '### Q1 open 2026-11-14T10:00Z',
    'parked: stage 1 (AAAA)',
    'ticket: F10',
    'reason: taste',
    'question: Which session expiry policy should F10 use?',
    'header: Expiry',
    'options:',
    '  - Sliding 7d (Recommended) | extends on activity | longer token lifetime',
    '  - Fixed 24h | strict daily re-login | interrupts active sessions',
    'default: Sliding 7d',
    'blocks: F10',
    'files: src/auth.ts',
    'answer: -',
    '',
    '### Q2 answered 2026-11-14T09:00Z',
    'parked: stage 1 (AAAA)',
    'ticket: F10',
    'reason: taste',
    'question: Already settled question?',
    'header: Settled',
    'options:',
    '  - Yes | a | b',
    '  - No | c | d',
    'default: Yes',
    'blocks: F10',
    'files: src/auth.ts',
    'answer: Yes',
    'answered: 2026-11-14T09:05Z',
    '',
  ].join('\n'), 'utf8');

  const win = process.platform === 'win32';
  const repoFwd = repo.replace(/\\/g, '/');
  // Lightweight git shim in bin so ticket-meta resolves TOP/MAIN/user.email inside the sandbox without git init.
  if (win) {
    writeFileSync(join(bin, 'git.cmd'), [
      '@echo off',
      'set "args=%*"',
      `echo %args% | findstr /C:"--show-toplevel" >nul && (echo ${repoFwd}& exit /b 0)`,
      `echo %args% | findstr /C:"--git-common-dir" >nul && (echo ${repoFwd}/.git& exit /b 0)`,
      'echo %args% | findstr /C:"user.email" >nul && (echo sabre@example.com& exit /b 0)',
      'echo %args% | findstr /C:"ls-files" >nul && exit /b 1',
      'exit /b 0',
    ].join('\r\n'), 'utf8');
  } else {
    writeFileSync(join(bin, 'git'), [
      '#!/bin/sh',
      'case "$*" in',
      `  *--show-toplevel*) printf '%s\\n' "${repo}" ;;`,
      `  *--git-common-dir*) printf '%s/.git\\n' "${repo}" ;;`,
      '  *user.email*) printf "sabre@example.com\\n" ;;',
      '  *ls-files*) exit 1 ;;',
      '  *) exit 0 ;;',
      'esac',
    ].join('\n'), { encoding: 'utf8', mode: 0o755 });
  }

  const env = {
    ...process.env,
    PATH: `${bin}${win ? ';' : ':'}${process.env.PATH ?? ''}`,
    RELAY_DIR: join(repo, '.skillator').replace(/\\/g, '/'),
    SKILLATOR_ME: '@sabre',
  };
  // a host session id would stamp the fixture board with this machine's session tag
  for (const key of ['CLAUDE_CODE_SESSION_ID', 'SKILLATOR_SESSION', 'SKILLATOR_MODE']) delete env[key];
  const runScript = (relBase, args) => win
    ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(plugin, `${relBase}.ps1`), ...args], { cwd: repo, env, encoding: 'utf8', windowsHide: true })
    : spawnSync('sh', [join(plugin, `${relBase}.sh`), ...args], { cwd: repo, env, encoding: 'utf8', windowsHide: true });
  const collectQuestions = () => {
    const boardLines = readFileSync(join(repo, 'TICKETS.md'), 'utf8').split(/\r?\n/);
    const decideIds = boardLines
      .map(l => /^- \[\?\] ([A-Z]{1,3}[0-9]+[a-z]?) /.exec(l)?.[1])
      .filter(Boolean);
    const qOut = runScript('skills/relay-morpheus/hooks/relay-morpheus', win ? ['-Mode', 'queue', '-All'] : ['queue', '--all']);
    ok(qOut);
    const runQs = [];
    let curRun = null;
    for (const line of qOut.stdout.split(/\r?\n/)) {
      const mRun = /^## (RUN-[0-9]+)/.exec(line);
      if (mRun) curRun = mRun[1];
      const mQ = /^(Q[0-9]+) \[/.exec(line);
      if (mQ && curRun) runQs.push(`${curRun}:${mQ[1]}`);
    }
    return [...decideIds, ...runQs];
  };

  // 1. Reconciled collection yields ONLY the two [?] tickets and the one open parked question, in order.
  assert.deepEqual(collectQuestions(), ['F12', 'A7', 'RUN-0001:Q1']);

  // 2. Record answers through the existing writers (F12 answered -> decided, A7 deferred -> defer, Q1 answered -> relay answer).
  ok(runScript('skills/tickets-zordon/scripts/ticket-meta', ['decided', 'F12']));
  ok(runScript('skills/tickets-zordon/scripts/ticket-meta', ['defer', 'A7', 'after v1 launch']));
  ok(runScript('skills/relay-morpheus/hooks/relay-morpheus', win
    ? ['-Mode', 'answer', '-Id', 'RUN-0001', '-Q', 'Q1', '-Text', 'Sliding 7d (Recommended)']
    : ['RUN-0001', 'answer', 'Q1', 'Sliding 7d (Recommended)']));

  // 3. Read back: zero open questions remain, and each writer recorded the exact state without touching other rows.
  assert.deepEqual(collectQuestions(), []);
  const afterBoard = readFileSync(join(repo, 'TICKETS.md'), 'utf8');
  // ticket-meta decided: [?] -> [ ], the [decide:] tag stays (its documented contract)
  assert.match(afterBoard, /^- \[ \] F12 — Pick auth token storage .*\[decide: @sabre\]$/m);
  assert.match(afterBoard, /^- \[>\] A7 — Choose audit retention window .* \(deferred: after v1 launch\)/m);
  assert.match(afterBoard, /^- \[ \] F10 — Build login form \[owner: @sabre\]$/m);
  assert.match(afterBoard, /^- \[~\] B4 — Fix header alignment \[owner: @sabre\]$/m);
  assert.match(afterBoard, /^- \[x\] F9 — Settled theme ruling/m);
  const afterRun = readFileSync(join(repo, '.skillator/run-0001-demo.md'), 'utf8');
  assert.match(afterRun, /^### Q1 answered /m);
  assert.match(afterRun, /^answer: Sliding 7d \(Recommended\)$/m);
});

// B30: the plugin cache is reached through a link (~/.claude-<profile>/plugins -> ~/.claude/plugins).
// argv[1] kept the link's spelling, import.meta.url the real path: main never ran, output was empty.
test('B30: every argv[1]-guarded script still runs its main through a linked plugin directory', t => {
  const d = mkdtempSync(join(tmpdir(), 'b30-link-'));
  const link = join(d, 'plugin');
  symlinkSync(plugin, link, process.platform === 'win32' ? 'junction' : 'dir');
  // The link goes first: a recursive rm must never walk through it into the repo.
  t.after(() => { (process.platform === 'win32' ? rmdirSync : unlinkSync)(link); rmSync(d, { recursive: true, force: true }); });
  for (const [file, args, status, line] of [
    ['practice/scripts/codex-isolation.mjs', ['--help'], 2, /^Usage: codex-isolation\.mjs /m],
    ['skills/tickets-zordon/scripts/shifu.mjs', ['--help'], 0, /^Shifu commands$/m],
    ['practice/scripts/generate-commands.mjs', ['--check'], 0, /^\d+ generated commands checked; 0 written\.$/m],
    ['practice/scripts/reliability-parity.mjs', ['--help'], 2, /^Usage: node reliability-parity\.mjs /m],
    ['practice/scripts/validate.mjs', ['--help'], 2, /^Usage: node validate\.mjs /m],
    ['mods/ops-board/antigravity/pack.mjs', [], 2, /^usage: node pack\.mjs <out\.vsix>$/m],
    ['skills/remote-cerebro/hooks/cerebro-bridge.mjs', ['--help'], 2, /^usage: cerebro doctor /m],
  ]) {
    const r = spawnSync(process.execPath, [join(link, file), ...args], { cwd: d, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(r.status, status, `${file} exit through the link: ${r.stderr}`);
    assert.match(r.stdout + r.stderr, line, `${file} through the link`);
  }
});
