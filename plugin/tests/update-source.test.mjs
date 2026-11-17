import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import fs from 'node:fs';
import nodePath from 'node:path';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const plugin = fileURLToPath(new URL('../', import.meta.url));
const available = (exe, args) => spawnSync(exe, args, { windowsHide: true, timeout: 10000 }).status === 0;
const ps = ['powershell', 'pwsh'].find(exe => available(exe, ['-NoProfile', '-Command', 'exit 0']));
const hasSh = available('sh', ['-c', 'exit 0']);
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
  const install = spawnSync(windows ? (ps || 'powershell') : 'sh', windows
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
test('every updater prioritizes .skillator-source over Claude Code installPath', () => {
  for (const path of commands) {
    const text = readFileSync(join(plugin, path), 'utf8');
    const bSection = text.match(/^\s*b\.([\s\S]*?)(?=^\s*c\.|\n\n)/m);
    assert.ok(bSection && bSection[1].includes('.skillator-source'), `${path}: option b. must describe .skillator-source`);
    const cSection = text.match(/^\s*c\.([\s\S]*?)(?=^\s*d\.|\n\n)/m);
    assert.ok(cSection && cSection[1].includes('installPath'), `${path}: option c. must describe installPath`);
    assert.ok(text.indexOf('.skillator-source') < text.indexOf('installPath'),
      `${path}: .skillator-source must appear before installPath`);

    const order = [];
    for (const opt of ['b', 'c']) {
      const m = text.match(new RegExp(`^\\s*${opt}\\.([\\s\\S]*?)(?=^\\s*[c-d]\\.|\\n\\n)`, 'm'));
      if (m) {
        if (m[1].includes('.skillator-source')) order.push('savedSource');
        else if (m[1].includes('installPath')) order.push('installPath');
      }
    }
    const candidates = { savedSource: '/path/to/saved-git-repo', installPath: '/path/to/claude-cache' };
    const chosen = order.map(k => candidates[k]).find(Boolean);
    assert.equal(chosen, candidates.savedSource,
      `${path}: source resolution must prefer .skillator-source over installPath even when installPath is present`);
  }
});
test('A231: every updater treats the pointer as a hint that never stops or downgrades the update', () => {
  for (const path of commands) {
    const text = readFileSync(join(plugin, path), 'utf8').replace(/\s+/g, ' ');
    const b = text.match(/ b\. (.*?) c\. /)?.[1] ?? '';
    assert.doesNotMatch(b, /older/, `${path}: option b. must not judge staleness before the pull`);
    const pull = text.indexOf('pull --ff-only'), rule = text.indexOf('Stale pointer');
    assert.ok(pull >= 0 && rule > pull, `${path}: the stale check must come after the pull`);
    const fails = text.slice(pull, rule);
    assert.match(fails, /Pull fails.*? From a\.[^→]*→ report it and stop before installation/, `${path}: an explicit path still stops on a failed pull`);
    assert.match(fails, /From b\. the pointer is a hint, not an order[^.]*say the pull failed and go on to c\./, `${path}: a pointer falls through on a failed pull`);
    const r = text.slice(rule, rule + 700);
    assert.doesNotMatch(r, /used, not skipped/, `${path}: a pulled clone may still be stale`);
    assert.match(r, /after the pull, or for a nongit cache.*Still older than.*step 1.*skip.*say so.*go on to c\..*never a downgrade/, `${path}: a stale pointer is skipped, pulled or not`);
    assert.match(r, /no skillator version in step 1.*use the pointer.*say so/, `${path}: no step-1 version uses the pointer`);
  }
});
test('both installer writers preserve updater instructions in every host template', { skip: !ps || !hasSh ? 'Missing executable: ' + [!ps && 'powershell/pwsh', !hasSh && 'sh'].filter(Boolean).join(', ') : false }, () => {
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
    for (const port of ['sh', ps]) {
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
test('A231: both installers normalize a Muse source path to the same string', { skip: process.platform !== 'win32' || !ps ? 'Windows with PowerShell only' : false }, () => {
  const normSrc = readFileSync(join(plugin, 'install.sh'), 'utf8').match(/^\s*const norm = (p => .*);\r?$/m)?.[1];
  assert.ok(normSrc, 'install.sh: muse_json norm not found');
  const nodeNorm = new Function('fs', 'path', `return ${normSrc}`)(fs, nodePath);
  const fx = join(root, 'a231'), real = join(fx, 'real'), skips = [];
  mkdirSync(join(real, 'sub'), { recursive: true }); mkdirSync(join(fx, 'a'));
  fs.symlinkSync(real, join(fx, 'junction'), 'junction');
  const viaLink = fs.realpathSync.native(join(real, 'sub')).replace(/\\/g, '/').toLowerCase();
  const sys = real.slice(0, 2), share = `\\\\localhost\\${sys[0]}$${real.slice(2)}\\sub`;
  // [input, expected]; expected null = the two installers must only agree
  const cases = [[join(fx, 'junction', 'sub'), viaLink], [`${fx}\\a\\..\\junction\\sub`, viaLink],
    ['\\\\?\\' + join(real, 'sub').toUpperCase(), viaLink],
    [`${sys.toUpperCase()}\\`, `${sys.toLowerCase()}/`], [`${sys.toLowerCase()}\\`, `${sys.toLowerCase()}/`],
    ['\\\\?\\UNC\\localhost\\a231-none\\x', '//localhost/a231-none/x'], ['\\\\LOCALHOST\\A231-None\\x\\', '//localhost/a231-none/x'],
    [share, null], [share.toUpperCase(), null]];
  try { fs.symlinkSync('..\\real', join(fx, 'a', 'rel'), 'dir'); cases.push([join(fx, 'a', 'rel', 'sub'), viaLink]); }
  catch { skips.push('relative symlink case (no symlink privilege)'); }
  try {
    const deep = join(real, 'l'.repeat(140), 'm'.repeat(140)); mkdirSync(deep, { recursive: true });
    cases.push([join(fx, 'junction', 'l'.repeat(140), 'M'.repeat(140)), fs.realpathSync.native(deep).replace(/\\/g, '/').toLowerCase()]);
  } catch (e) { skips.push(`long path case (${e.code || e.message})`); }
  const script = join(fx, 'norm.ps1');
  writeFileSync(script, `param([switch]$NoAddType)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
if ($NoAddType) { function Add-Type { throw 'a231 no Add-Type' } }
$ast = [Management.Automation.Language.Parser]::ParseFile('${join(plugin, 'install.ps1').replaceAll("'", "''")}', [ref]$null, [ref]$null)
. ([scriptblock]::Create($ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Normalize-MusePath' }, $true).Extent.Text))
foreach ($p in ([Console]::In.ReadToEnd() | ConvertFrom-Json)) { Normalize-MusePath $p }`);
  const psNorm = (inputs, ...flags) => {
    const r = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...flags],
      { input: JSON.stringify(inputs), encoding: 'utf8', timeout: 120000, windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim().split(/\r?\n/);
  };
  // the letters are picked just before use: one stays unmapped, one becomes a subst drive
  const free = 'ZYXWVUTSRQPONMLKJIHG'.split('').filter(l => !fs.existsSync(`${l}:\\`));
  const gone = free[0], drive = process.env.SKILLATOR_NO_SUBST === '1' ? undefined : free[1];
  if (gone) cases.push([`${gone}:\\gone\\x\\`, `${gone.toLowerCase()}:/gone/x`]);
  else skips.push('unmapped drive case (no free drive letter)');
  const subst = drive && spawnSync('subst', [`${drive}:`, real], { timeout: 15000, windowsHide: true }).status === 0;
  try {
    if (subst) cases.push([`${drive}:\\sub`, viaLink], [`${drive}:\\`, viaLink.slice(0, -'/sub'.length)]);
    else skips.push(`subst case (${process.env.SKILLATOR_NO_SUBST === '1' ? 'SKILLATOR_NO_SUBST=1' : drive ? 'subst failed' : 'no free drive letter'})`);
    const psOut = psNorm(cases.map(c => c[0]));
    cases.forEach(([input, want], i) => {
      const n = nodeNorm(input);
      assert.equal(psOut[i], n, `${input}: install.ps1 and install.sh disagree`);
      if (want !== null) assert.equal(n, want, `${input}: normalized wrongly`);
      assert.equal(n, n.toLowerCase(), `${input}: not lowercased`);
    });
  } finally { if (subst) spawnSync('subst', [`${drive}:`, '/d'], { timeout: 15000, windowsHide: true }); }
  // no link resolution: the string-only form, explained by one note however many paths follow
  const written = [join(fx, 'junction', 'sub'), `${sys.toUpperCase()}\\`, real];
  assert.deepEqual(psNorm(written, '-NoAddType'), ['note: link resolution unavailable (a231 no Add-Type) - comparing paths as written',
    ...written.map(p => p.replace(/\\/g, '/').toLowerCase().replace(/(?<!:)\/$/, ''))]);
  for (const s of skips) console.log(`# skip A231 ${s}`);
});
