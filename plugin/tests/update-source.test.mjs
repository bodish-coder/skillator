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
const shells = ['powershell', 'pwsh'].filter(exe => available(exe, ['-NoProfile', '-Command', 'exit 0']));
const ps = shells[0];
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
    assert.match(fails, /go on to c\. If c\. resolves to the directory of the failed b\. checkout, report it and stop/, `${path}: the fallback after a failed pull is a different directory`);
    const r = text.slice(rule, rule + 700);
    assert.doesNotMatch(r, /used, not skipped/, `${path}: a pulled clone may still be stale`);
    assert.match(r, /after the pull, or for a nongit cache.*Still older than.*step 1.*skip.*say so.*go on to c\..*never a downgrade/, `${path}: a stale pointer is skipped, pulled or not`);
    assert.match(r, /no skillator version in step 1.*use the pointer.*say so/, `${path}: no step-1 version uses the pointer`);
  }
});
// A232: a hung or runaway sh selftest fails fast with a reason instead of blocking for hours
test('sh selftest stops at its time limit and says so', { skip: !hasSh || !available('sh', ['-c', 'command -v timeout']) ? 'no sh or no timeout' : false }, () => {
  const started = Date.now();
  const r = spawnSync('sh', [join(plugin, 'install.sh').replaceAll('\\', '/'), '--selftest'],
    { env: { ...env, SKILLATOR_SELFTEST_TIMEOUT: '2' }, encoding: 'utf8', timeout: 120000, windowsHide: true });
  assert.equal(r.status, 124, r.stdout + r.stderr);
  assert.match(r.stdout, /^FAIL: selftest still running after 2s \(SKILLATOR_SELFTEST_TIMEOUT\)$/m);
  assert.ok(Date.now() - started < 60000, 'the limit stopped it');
});
test('both installer writers preserve updater instructions in every host template', { skip: !ps || !hasSh ? 'Missing executable: ' + [!ps && 'powershell/pwsh', !hasSh && 'sh'].filter(Boolean).join(', ') : false }, () => {
  const shell = readFileSync(join(plugin, 'install.sh'), 'utf8').replaceAll('\r', '');
  const functions = ['native', 'subst', 'under_link', 'put_cmd'].map(name => {
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
foreach ($name in 'Test-UnderLink', 'Write-Cmd') {
  $fn = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)
  if (-not $fn) { throw "Missing $name" }
  . ([scriptblock]::Create($fn.Extent.Text))
}
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
// the A231 normalizer alone, extracted from install.ps1, fed a JSON array of paths on stdin
const normScript = dir => {
  const script = join(dir, 'norm.ps1');
  writeFileSync(script, `param([switch]$NoAddType, [switch]$LegacyPaths, [switch]$FakeOS, [switch]$BrokenFinalPath)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
if ($NoAddType) { function Add-Type { $global:a231Compiles++; throw 'a231 no Add-Type' } }
if ($FakeOS) { $env:OS = 'a231' }
if ($LegacyPaths) { # Windows PowerShell 5.1 as an older .NET runs it: GetFullPath stops at 260 characters
  foreach ($s in 'UseLegacyPathHandling', 'BlockLongPaths') { [AppContext]::SetSwitch("Switch.System.IO.$s", $true) }
  $t = [object].Assembly.GetType('System.AppContextSwitches')
  foreach ($f in '_useLegacyPathHandling', '_blockLongPaths') { $t.GetField($f, 'NonPublic,Static').SetValue($null, 0) }
  try { [void][IO.Path]::GetFullPath('C:\\' + ('l' * 300)); [Console]::Error.WriteLine('legacy: GetFullPath did not throw PathTooLongException') } catch [IO.PathTooLongException] {}
}
if ($BrokenFinalPath) { # compiled, but every Win32 call fails at run time
  Add-Type -TypeDefinition 'public static class MuseFinalPath { public static int Gets, Fulls; public static string Get(string p) { Gets++; throw new System.EntryPointNotFoundException("a234 get"); } public static string Full(string p) { Fulls++; throw new System.EntryPointNotFoundException("a234 full"); } }'
}
$ast = [Management.Automation.Language.Parser]::ParseFile('${join(plugin, 'install.ps1').replaceAll("'", "''")}', [ref]$null, [ref]$null)
. ([scriptblock]::Create($ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Normalize-MusePath' }, $true).Extent.Text))
foreach ($p in ([Console]::In.ReadToEnd() | ConvertFrom-Json)) { Normalize-MusePath $p }
if ($NoAddType) { [Console]::Error.WriteLine("compiles: $global:a231Compiles") }
if ($BrokenFinalPath) { [Console]::Error.WriteLine("calls: $([MuseFinalPath]::Gets) $([MuseFinalPath]::Fulls)") }`);
  return script;
};
// [stdout lines, stderr lines]
const psRun = (shell, script, inputs, flags = [], cwd) => {
  const r = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...flags],
    { input: JSON.stringify(inputs), cwd, encoding: 'utf8', timeout: 120000, windowsHide: true });
  assert.equal(r.status, 0, `${shell}: ${r.stderr || r.error}`);
  return [r.stdout, r.stderr].map(t => t.trim().split(/\r?\n/).filter(Boolean));
};
const note = (step, why) => `note: path resolution unavailable (${step}: ${why}) - comparing paths as written`;
// A234: under Windows PowerShell 5.1 and under pwsh; powershell.exe is never skipped on Windows
for (const shell of ['powershell', 'pwsh']) test(`A231: both installers normalize a Muse source path to the same string (${shell})`,
  { skip: process.platform !== 'win32' ? 'Windows only' : shell === 'pwsh' && !shells.includes('pwsh') ? 'no pwsh on PATH' : false }, () => {
  const normSrc = readFileSync(join(plugin, 'install.sh'), 'utf8').match(/^\s*const norm = (p => .*);\r?$/m)?.[1];
  assert.ok(normSrc, 'install.sh: muse_json norm not found');
  const nodeNorm = new Function('fs', 'path', `return ${normSrc}`)(fs, nodePath);
  const fx = join(root, `a231-${shell}`), real = join(fx, 'real'), skips = [];
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
  // A234: the long-path case is never skipped
  const L = 'l'.repeat(140), M = 'm'.repeat(140), deep = join(real, L, M);
  mkdirSync(deep, { recursive: true });
  const want = fs.realpathSync.native(deep).replace(/\\/g, '/').toLowerCase();
  cases.push([join(fx, 'junction', L, M.toUpperCase()), want]);
  const script = normScript(fx);
  // the letters are picked just before use: one stays unmapped, one becomes a subst drive
  const free = 'ZYXWVUTSRQPONMLKJIHG'.split('').filter(l => !fs.existsSync(`${l}:\\`));
  const gone = free[0], drive = process.env.SKILLATOR_NO_SUBST === '1' ? undefined : free[1];
  if (gone) cases.push([`${gone}:\\gone\\x\\`, `${gone.toLowerCase()}:/gone/x`]);
  else skips.push('unmapped drive case (no free drive letter)');
  const subst = drive && spawnSync('subst', [`${drive}:`, real], { timeout: 15000, windowsHide: true }).status === 0;
  try {
    if (subst) cases.push([`${drive}:\\sub`, viaLink], [`${drive}:\\`, viaLink.slice(0, -'/sub'.length)]);
    else skips.push(`subst case (${process.env.SKILLATOR_NO_SUBST === '1' ? 'SKILLATOR_NO_SUBST=1' : drive ? 'subst failed' : 'no free drive letter'})`);
    const [psOut, psErr] = psRun(shell, script, cases.map(c => c[0]));
    assert.deepEqual(psErr, [], 'resolvable paths print no note');
    cases.forEach(([input, want], i) => {
      const n = nodeNorm(input);
      assert.equal(psOut[i], n, `${input}: install.ps1 and install.sh disagree`);
      if (want !== null) assert.equal(n, want, `${input}: normalized wrongly`);
      assert.equal(n, n.toLowerCase(), `${input}: not lowercased`);
    });
  } finally { if (subst) spawnSync('subst', [`${drive}:`, '/d'], { timeout: 15000, windowsHide: true }); }
  const asWritten = p => p.replace(/\\/g, '/').toLowerCase();
  if (shell === 'powershell') {
    // Windows PowerShell 5.1 with its 260-character limit (the script checks GetFullPath really throws):
    // '..', a relative path, a drive-relative C:x, trailing dots and spaces and a \\server path resolve as Win32 does
    const unc = `\\\\localhost\\${sys[0]}$${real.slice(2)}\\${L}\\${M}`;
    const legacy = [[`${fx}\\junction\\${L}\\x\\..\\${M.toUpperCase()}`, want], [`${L}\\.\\${M}\\..\\${M}`, want],
      [`${sys}${L}\\${M}`, want], [`${fx}\\junction\\${L}\\${M}. .`, want], [unc, nodeNorm(unc)]];
    assert.deepEqual(psRun(shell, script, legacy.map(c => c[0]), ['-LegacyPaths'], real), [legacy.map(c => c[1]), []]);
    // A234: one note per failing step, each step tried once
    const long = `${real}\\${L}\\${M}`, short = join(real, 'sub');
    assert.deepEqual(psRun(shell, script, [long, short, long, short], ['-LegacyPaths', '-BrokenFinalPath']),
      [[long, short, long, short].map(asWritten), [note('long path', 'a234 full'), note('final path', 'a234 get'), 'calls: 1 1']]);
  }
  // A234: a Win32 call that fails at run time is cached like a failed compile, its note printed once
  const short = [join(real, 'sub'), join(fx, 'a')];
  assert.deepEqual(psRun(shell, script, short, ['-BrokenFinalPath']), [short.map(asWritten), [note('final path', 'a234 get'), 'calls: 1 0']]);
  // no link resolution: only the string-only form on stdout; one compile attempt and one note on stderr
  const written = [join(fx, 'junction', 'sub'), `${sys.toUpperCase()}\\`, real];
  assert.deepEqual(psRun(shell, script, written, ['-NoAddType']), [written.map(p => asWritten(p).replace(/(?<!:)\/$/, '')),
    [note('Add-Type', 'a231 no Add-Type'), 'compiles: 1']]);
  // A234: Windows is the platform, not $env:OS, which any caller can set: the case still folds
  const cased = join(fx, 'NoSuch', 'CaSe');
  assert.deepEqual(psRun(shell, script, [cased], ['-FakeOS'])[0], [asWritten(cased)]);
  for (const s of skips) console.log(`# skip A231 ${s}`);
});
// A234: off Windows a POSIX path resolves as POSIX: no \ separators, the case kept, no Win32 call
test('A234: off Windows a Muse source path keeps its separators and case', { skip: process.platform === 'win32' ? 'off Windows only (pwsh on Linux or macOS)' : !shells.includes('pwsh') ? 'no pwsh on PATH' : false }, () => {
  const fx = join(root, 'a234-posix'); mkdirSync(fx, { recursive: true });
  assert.deepEqual(psRun('pwsh', normScript(fx), ['/tmp/A234-None/x/']), [['/tmp/A234-None/x'], []]);
});
