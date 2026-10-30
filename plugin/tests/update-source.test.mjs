import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const plugin = fileURLToPath(new URL('../', import.meta.url));
const commands = ['commands/skillator-update.md', 'host-commands/antigravity/skillator-update/SKILL.md',
  ...['cursor', 'pi', 'opencode'].map(h => `host-commands/${h}/skillator-update.md`),
  'host-commands/gemini/skillator-update.toml'];
const root = mkdtempSync(join(tmpdir(), 'a168-'));
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'gitconfig'),
  GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file', GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
writeFileSync(env.GIT_CONFIG_GLOBAL, '');
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT']) delete env[key];
function git(args, allowFailure = false) {
  const r = spawnSync('git', args, { env, encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (!allowFailure) assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr || r.error}`);
  return r;
}
const at = (dir, ...args) => git(['-C', dir, ...args]);
const write = (dir, path, text) => writeFileSync(join(dir, path), text);
const origin = join(root, 'origin.git');
const author = join(root, 'author');
git(['init', '--bare', '--initial-branch=main', origin]);
git(['clone', origin, author]);
mkdirSync(join(author, 'plugin'));
const stubSh = 'printf "called\\n" >> "$A168_INSTALL_LOG"\n';
const stubPs = 'param([switch]$Force)\n[IO.File]::AppendAllText($env:A168_INSTALL_LOG, "called`n")\n';
write(author, 'plugin/install.sh', stubSh);
write(author, 'plugin/install.ps1', stubPs);
write(author, 'plugin/helper', 'old\n');
at(author, 'add', '.'); at(author, 'commit', '-m', 'initial'); at(author, 'push', 'origin', 'main');
const clones = {};
for (const name of ['clone root', 'plugin source', 'worktree base', 'diverged', 'no upstream', 'removed']) {
  clones[name] = join(root, name); git(['clone', origin, clones[name]]);
}
const linked = join(root, 'linked worktree');
at(clones['worktree base'], 'worktree', 'add', '-b', 'linked', linked);
at(linked, 'branch', '--set-upstream-to=origin/main');
at(clones['no upstream'], 'branch', '--unset-upstream');
write(clones.diverged, 'local', 'local\n');
at(clones.diverged, 'add', '.'); at(clones.diverged, 'commit', '-m', 'local divergence');
write(author, 'plugin/helper', 'new\n');
at(author, 'add', '.'); at(author, 'commit', '-m', 'new helper'); at(author, 'push', 'origin', 'main');

// Execute the sequence specified by the command, including its historical .git gate for RED.
function update(source, body) {
  let dir = source;
  const installers = d => ['install.sh', 'install.ps1'].every(f => existsSync(join(d, f)));
  if (!installers(dir)) dir = join(source, 'plugin');
  assert.ok(installers(dir), 'source must contain both installers');
  const calls = [];
  const log = join(dir, 'installer-calls');
  const installs = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').length : 0;
  let checkout;
  if (body.includes('rev-parse --show-toplevel')) {
    const probe = git(['-C', dir, 'rev-parse', '--show-toplevel'], true);
    if (probe.status === 0) checkout = probe.stdout.trim();
    else assert.match(probe.stderr, /not a git repository/, 'only a confirmed nongit cache may skip pulling');
  } else if (existsSync(join(source, '.git'))) checkout = source;
  if (checkout) {
    const argv = ['-C', checkout, 'pull', '--ff-only']; calls.push(argv);
    if (git(argv, true).status !== 0) return { dir, calls, installs: installs() };
  }
  if (!installers(dir)) return { dir, calls, installs: installs() };
  const windows = process.platform === 'win32';
  const install = spawnSync(windows ? 'powershell' : 'sh', windows
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'install.ps1'), '-Force']
    : [join(dir, 'install.sh'), '--force'],
  { env: { ...env, A168_INSTALL_LOG: log }, encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.equal(install.status, 0, install.stderr || String(install.error));
  return { dir, calls, installs: installs(), helper: readFileSync(join(dir, 'helper'), 'utf8') };
}
const body = readFileSync(join(plugin, commands[0]), 'utf8');
test('every updater carries membership, retained-directory and failure guards', () => {
  for (const path of commands) {
    const text = readFileSync(join(plugin, path), 'utf8');
    for (const token of ['rev-parse --show-toplevel', 'git -C <checkout-root> pull --ff-only',
      'Re-check both installers', 'never merge, reset, stash or force', 'nongit cache']) {
      assert.ok(text.includes(token), `${path}: missing ${token}`);
    }
    assert.ok(!text.includes('it has `.git`'), path);
  }
});
test('both installer writers preserve updater instructions in every host template', () => {
  const shell = readFileSync(join(plugin, 'install.sh'), 'utf8').replaceAll('\r', '');
  const functions = ['native', 'subst', 'put_cmd'].map(name => {
    const match = shell.match(new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}`, 'm'));
    assert.ok(match, `missing shell function ${name}`); return match[0];
  }).join('\n');
  const shellDriver = join(root, 'write-command.sh');
  writeFileSync(shellDriver, `set -eu\ndry=''\n${functions}\nput_cmd "$1" "$2" "$3"\n`);
  const psDriver = join(root, 'write-command.ps1');
  writeFileSync(psDriver, `param($Installer, $Template, $Skills, $Target)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($Installer, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Installer parse failure' }
$fn = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Write-Cmd' }, $true)
if (-not $fn) { throw 'Missing Write-Cmd' }
. ([scriptblock]::Create($fn.Extent.Text))
Write-Cmd $Template $Skills $Target
`);
  const skills = join(root, 'isolated skills').replaceAll('\\', '/');
  for (const [i, path] of commands.slice(1).entries()) {
    const template = join(plugin, path);
    const expected = readFileSync(template, 'utf8').replaceAll('\r', '').replaceAll('{{SKILLS}}', skills);
    for (const port of ['sh', 'powershell']) {
      const output = join(root, `generated-${i}-${port}`);
      const args = port === 'sh' ? [shellDriver, template, skills, `generated-${i}-${port}`].map(p => p.replaceAll('\\', '/'))
        : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psDriver, join(plugin, 'install.ps1'), template, skills, output];
      const r = spawnSync(port, args, { cwd: root, env, encoding: 'utf8', timeout: 15000, windowsHide: true });
      assert.equal(r.status, 0, `${port}: ${r.stderr || r.error}`);
      assert.equal(r.stderr, '', `${port} warning`);
      assert.equal(readFileSync(output, 'utf8'), expected, `${port}: ${path}`);
    }
  }
});
for (const [name, source, checkout] of [
  ['clone root', clones['clone root'], clones['clone root']],
  ['plugin subdirectory', join(clones['plugin source'], 'plugin'), clones['plugin source']],
  ['linked worktree plugin', join(linked, 'plugin'), linked],
]) test(name + ' refreshes helper and retains installer directory', () => {
  const r = update(source, body);
  assert.equal(r.helper, 'new\n'); assert.equal(r.installs, 1);
  assert.equal(resolve(r.dir), resolve(checkout, 'plugin'));
  assert.equal(r.calls.length, 1);
  assert.deepEqual(r.calls[0].slice(2), ['pull', '--ff-only']);
  assert.equal(resolve(r.calls[0][1]), resolve(checkout));
});
test('nongit cache installs without pulling', () => {
  const cache = join(root, 'cache'); mkdirSync(cache);
  write(cache, 'install.sh', stubSh); write(cache, 'install.ps1', stubPs); write(cache, 'helper', 'cache\n');
  const r = update(cache, body);
  assert.equal(r.installs, 1); assert.deepEqual(r.calls, []); assert.equal(r.helper, 'cache\n');
});
for (const name of ['diverged', 'no upstream']) test(name + ' stops before installation', () => {
  const r = update(join(clones[name], 'plugin'), body);
  assert.equal(r.installs, 0); assert.equal(r.calls.length, 1);
  assert.equal(readFileSync(join(clones[name], 'plugin/helper'), 'utf8'), 'old\n');
});
test('installers removed by a successful pull stop installation', () => {
  at(author, 'rm', 'plugin/install.ps1'); at(author, 'commit', '-m', 'remove installer');
  at(author, 'push', 'origin', 'main');
  const r = update(join(clones.removed, 'plugin'), body);
  assert.equal(r.installs, 0); assert.equal(r.calls.length, 1);
});
// Retain isolated fixtures for inspection; no recursive deletion or live profile access.
console.log(`A168 local fixtures: ${root}`);
