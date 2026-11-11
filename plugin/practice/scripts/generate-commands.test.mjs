import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
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
  const unique = ['archive-zordon', 'engage-picard', 'list-ticket-zordon', 'gauntlet-plan', 'gauntlet-run', 'pending-sentinel',
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

test('Windows PowerShell installer writes all 16 Codex skill wrappers with exact substituted bytes', { skip: process.platform !== 'win32' ? 'Windows PowerShell writer check requires Windows' : false }, t => {
  const root = fixture(t);
  ok(run(root, '--write'));
  const driver = join(root, 'writer.ps1');
  const target = join(root, 'isolated profile', 'skills');
  writeFileSync(driver, `param($InstallerDirectory, $TemplateRoot, $Target)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $InstallerDirectory 'install.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Installer parse failure' }
foreach ($name in 'Write-Cmd', 'Write-Commands') {
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
  assert.equal(paths.length, 16);
  for (const path of paths) {
    const actual = readFileSync(join(target, path.replace('host-commands/antigravity/', '')));
    const expected = readFileSync(join(root, path), 'utf8').replaceAll('{{SKILLS}}', target);
    assert.deepEqual(actual, Buffer.from(expected, 'utf8'), path);
  }
});
