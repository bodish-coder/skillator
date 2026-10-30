// Disposable integration fixture. Offline installation is not native skill loading.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { reportCode } from './reliability-parity.mjs';
import { nativeProbe } from './codex-native-probe.mjs';
export { nativeProbe };

const here = fileURLToPath(new URL('.', import.meta.url));
const plugin = resolve(here, '../..');
const repository = resolve(plugin, '..');
const physical = path => { const value = realpathSync(path); return process.platform === 'win32' ? value.toLowerCase() : value; };
export function validateTempParent(parent) {
  const candidate = physical(parent), repo = physical(repository);
  const rel = relative(repo, candidate);
  if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)) throw new Error('Temporary root is inside the source repository');
  // Also reject a different checkout. The fixture gets its own Git boundary.
  for (let path = candidate; ; path = dirname(path)) {
    if (existsSync(join(path, '.git'))) throw new Error('Temporary root has repository ancestors');
    if (dirname(path) === path) break;
  }
  return realpathSync(parent);
}
const put = (path, text) => { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, text, 'utf8'); };
export function isolatedEnv(root, inherited = process.env) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (inherited[key]) env[key] = inherited[key];
  Object.assign(env, { PATH: '', HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), CODEX_HOME: join(root, 'codex'),
    XDG_CONFIG_HOME: join(root, 'xdg/config'), XDG_DATA_HOME: join(root, 'xdg/data'), XDG_CACHE_HOME: join(root, 'xdg/cache'),
    APPDATA: join(root, 'appdata'), LOCALAPPDATA: join(root, 'localappdata'), TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'),
    SKILLATOR_CONFIG_DIR: join(root, 'config'), CLAUDE_USAGE_WATCH_DIR: join(root, 'watch'),
    SKILLATOR_CLI: 'codex', SKILLATOR_PROFILE_DIR: join(root, 'codex') });
  return env;
}
const outcome = (status, reason) => ({ status, reason });
export function hookResult(stdout) {
  return /^src=codex 5h=12\.0 7d=13\.0 ctx=- max=13\.0\s*$/.test(stdout)
    ? outcome('passed', 'Synthetic quota source matched exactly') : outcome('failed', 'Quota output did not match the isolated rollout');
}
export function commandProjection(source, dest) {
  let generated = 0;
  const missing = [];
  for (const dir of readdirSync(join(source, 'host-commands/antigravity'), { withFileTypes: true }).filter(d => d.isDirectory())) {
    const template = join(source, 'host-commands/antigravity', dir.name, 'SKILL.md');
    if (!existsSync(template)) continue;
    const target = join(dest, dir.name, 'SKILL.md');
    const expected = readFileSync(template, 'utf8').replaceAll('\r', '').replaceAll('{{SKILLS}}', dest);
    if (!existsSync(target) || readFileSync(target, 'utf8') !== expected) missing.push(dir.name); else generated++;
  }
  return missing.length || !generated ? outcome('failed', 'Missing or divergent generated commands: ' + missing.join(', ')) : outcome('passed', `${generated} generated command files match installer substitution; no native loading claimed`);
}
const execute = (exe, args, options) => spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024, ...options });
export async function liveCheck(exe, fixture, run = execute) {
  const options = { cwd: fixture.project, env: fixture.env };
  const version = run(exe, ['--version'], options);
  if (version.error || version.status !== 0) return outcome('blocked', 'Selected Codex executable unavailable or version probe failed');
  const cliVersion = version.stdout?.trim();
  if (!/^codex(?:-cli)? \d+\.\d+\.\d+(?:[-+][\w.-]{1,80})?$/.test(cliVersion || '')) return outcome('blocked', 'Unrecognized Codex version response');
  const help = run(exe, ['--help'], options);
  const serverHelp = run(exe, ['app-server', '--help'], options);
  if (help.status !== 0 || serverHelp.status !== 0 || !/\bapp-server\b/.test(help.stdout || '') || !(serverHelp.stdout || '').includes('generate-json-schema')) {
    return { ...outcome('blocked', 'Selected CLI help does not advertise required native app-server/schema capabilities'), cliVersion };
  }
  const schemaHelp = run(exe, ['app-server', 'generate-json-schema', '--help'], options);
  if (schemaHelp.status !== 0 || !(schemaHelp.stdout || '').includes('--out')) return { ...outcome('blocked', 'Selected CLI schema output flag unsupported'), cliVersion };
  const schemaDir = mkdtempSync(join(fixture.root, 'schema-'));
  const schema = run(exe, ['app-server', 'generate-json-schema', '--out', schemaDir], options);
  if (schema.status !== 0 || schema.error) return { ...outcome('blocked', 'Selected CLI schema generation failed'), cliVersion };
  try {
    let bytes = 0;
    const readSchemas = dir => readdirSync(dir, { withFileTypes: true }).flatMap(file => {
      const path = join(dir, file.name);
      if (file.isSymbolicLink()) throw new Error('Unexpected schema link');
      if (file.isDirectory()) return readSchemas(path);
      if (!file.name.endsWith('.json')) return [];
      bytes += lstatSync(path).size; if (bytes > 16 * 1024 * 1024) throw new Error('Schema budget exceeded');
      return [JSON.stringify(JSON.parse(readFileSync(path, 'utf8')))];
    });
    const text = readSchemas(schemaDir).join('\n');
    if (!['skills/list', 'hooks/list', 'thread/start', 'turn/start', 'skill', 'read-only', 'ephemeral', 'approvalPolicy'].every(value => text.includes('"' + value + '"'))) throw new Error('Required schema shape absent');
  } catch { return { ...outcome('blocked', 'Selected CLI schema missing required native protocol capabilities or malformed'), cliVersion }; }
  const entries = await nativeProbe(exe, fixture);
  return { ...outcome(reportCode(entries) === 0 ? 'passed' : reportCode(entries) === 1 ? 'failed' : 'blocked', 'Native inventory/injection checks completed'), cliVersion, entries };
}

export function runOffline(parent = tmpdir()) {
  const root = mkdtempSync(join(validateTempParent(parent), 'codex-isolation-'));
  validateTempParent(root);
  const env = isolatedEnv(root);
  for (const [key, path] of Object.entries(env)) if (!['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'SKILLATOR_CLI'].includes(key)) mkdirSync(path, { recursive: true });
  const project = join(root, 'project'); mkdirSync(project);
  // A local repository boundary stops upward discovery; no git executable runs.
  mkdirSync(join(project, '.git/objects'), { recursive: true }); mkdirSync(join(project, '.git/refs'));
  put(join(project, '.git/HEAD'), 'ref: refs/heads/isolation\n');
  put(join(project, '.git/config'), '[core]\n repositoryformatversion = 0\n bare = false\n');
  const source = join(root, 'source'); mkdirSync(source);
  const entries = [];
  const record = (id, result, command = [], evidence = {}) => entries.push({ id, ...result, command, code: result.status === 'passed' ? 0 : result.status === 'failed' ? 1 : null, evidence });
  // Known repository source only, never profiles, auth files, symlinks or dependencies.
  for (const path of ['install.ps1', 'skills', 'host-commands', 'practice', 'references', 'mods/ops-board', 'PLATFORMS.md', 'PRACTICE.md', 'WORKFLOW.md']) {
    cpSync(join(plugin, path), join(source, path), { recursive: true, filter: (src) => !['node_modules', '.git'].includes(basename(src)) && !lstatSync(src).isSymbolicLink() });
  }
  const ps = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe') : 'pwsh';
  const wrapper = join(root, 'install-fixture.ps1');
  put(wrapper, `param([string]$Source,[string]$Profile)\n$ErrorActionPreference='Stop'\nif ($HOME -ne $env:HOME) { throw 'PowerShell HOME isolation unsupported' }\n& (Join-Path $Source 'install.ps1') -Profile $Profile\n`);
  const command = [ps, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapper, source, join(root, 'profile.ps1')];
  const installed = execute(ps, command.slice(1), { cwd: project, env });
  record('offline-installation', installed.error ? outcome('blocked', 'PowerShell unavailable or installation timeout') : installed.status === 0 ? outcome('passed', 'Copied installer entrypoint ran with only disposable Codex marker and empty PATH') : outcome('failed', 'Copied installer failed; see fixture output'), command);
  put(join(root, 'installer.stdout'), installed.stdout || ''); put(join(root, 'installer.stderr'), installed.stderr || '');
  entries.at(-1).evidence = { stdout: join(root, 'installer.stdout'), stderr: join(root, 'installer.stderr') };
  const dest = join(env.CODEX_HOME, 'skills');
  record('offline-command-projection', installed.status === 0 ? commandProjection(source, dest) : outcome('blocked', 'Installation prerequisite did not pass'));
  const hook = join(dest, 'watch-cortana/hooks/usage-watch.ps1');
  put(join(env.CODEX_HOME, 'sessions/rollout-fixture.jsonl'), '{"type":"session_meta","payload":{"id":"fixture"}}\n{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":12,"window_minutes":300},"secondary":{"used_percent":13,"window_minutes":10080}}}}\n');
  put(join(env.HOME, '.codex/sessions/rollout-outside.jsonl'), readFileSync(join(env.CODEX_HOME, 'sessions/rollout-fixture.jsonl'), 'utf8').replaceAll('"used_percent":12', '"used_percent":99').replaceAll('"used_percent":13', '"used_percent":99'));
  env.CODEX_THREAD_ID = 'fixture';
  if (existsSync(hook)) {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', hook, '-Mode', 'level'];
    const result = execute(ps, args, { cwd: project, env });
    record('offline-usage-hook', result.error ? outcome('blocked', 'Usage hook unavailable') : result.status !== 0 ? outcome('failed', 'Usage hook exited nonzero') : hookResult(result.stdout), [ps, ...args]);
    const gateRollout = join(env.CODEX_HOME, 'sessions/rollout-gate.jsonl');
    put(gateRollout, readFileSync(join(env.CODEX_HOME, 'sessions/rollout-fixture.jsonl'), 'utf8').replace('"used_percent":13', '"used_percent":91'));
    const gateArgs = [...args.slice(0, -1), 'gate'];
    const gate = execute(ps, gateArgs, { cwd: project, env, input: JSON.stringify({ session_id: 'fixture-gate', transcript_path: gateRollout }) });
    let blocked = false;
    try { blocked = JSON.parse(gate.stdout).decision === 'block'; } catch { /* Assertion below records malformed output. */ }
    record('offline-usage-gate', gate.error ? outcome('blocked', 'Usage gate unavailable') : gate.status === 0 && blocked ? outcome('passed', 'Installed Stop gate blocks synthetic 91% weekly rollout; native hook trust not tested') : outcome('failed', 'Installed Stop gate did not block synthetic weekly limit'), [ps, ...gateArgs]);
  } else record('offline-usage-hook', outcome('blocked', 'Installed usage hook missing'));
  delete env.CODEX_THREAD_ID;
  const sources = [join(project, 'AGENTS.md'), join(env.CODEX_HOME, 'AGENTS.md'), join(dest, 'isolation-probe/SKILL.md')];
  const tokens = sources.map(() => randomUUID());
  put(sources[0], `Isolation token: ${tokens[0]}\n`); put(sources[1], `Isolation token: ${tokens[1]}\n`);
  put(sources[2], `---\nname: isolation-probe\ndescription: Read-only isolation evidence probe.\n---\nIsolation token: ${tokens[2]}\n`);
  mkdirSync(join(env.HOME, '.agents/skills'), { recursive: true });
  const pending = join(dest, 'pending/SKILL.md');
  const hookSource = join(env.CODEX_HOME, 'hooks.json');
  const hookCommand = `"${ps}" -NoProfile -ExecutionPolicy Bypass -File "${hook}" -Mode gate`;
  put(hookSource, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: hookCommand, timeout: 10 }] }] } }, null, 2));
  const fixture = { root, project, source, env, hookSource, hookCommand, expected: { sources: [...sources, pending], tokens, commandContent: existsSync(pending) ? readFileSync(pending, 'utf8') : '' }, entries };
  put(join(root, 'fixture.json'), JSON.stringify({ version: 1, project, home: env.HOME, codexHome: env.CODEX_HOME, sources: fixture.expected.sources, tokens, hookSource }, null, 2));
  return fixture;
}
export function resumeFixture(path) {
  const root = validateTempParent(path), env = isolatedEnv(root), project = join(root, 'project');
  const manifestPath = join(root, 'fixture.json');
  if (lstatSync(manifestPath).isSymbolicLink()) throw new Error('Fixture manifest link rejected');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const dest = join(env.CODEX_HOME, 'skills');
  const sources = [join(project, 'AGENTS.md'), join(env.CODEX_HOME, 'AGENTS.md'), join(dest, 'isolation-probe/SKILL.md'), join(dest, 'pending/SKILL.md')];
  const tokens = manifest.tokens;
  if (manifest.version !== 1 || !Array.isArray(tokens) || tokens.length !== 3 || !tokens.every(t => /^[0-9a-f-]{36}$/.test(t)) || JSON.stringify(manifest.sources) !== JSON.stringify(sources)) throw new Error('Invalid fixture manifest');
  const ps = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe') : 'pwsh';
  const hook = join(dest, 'watch-cortana/hooks/usage-watch.ps1'), hookSource = join(env.CODEX_HOME, 'hooks.json');
  const hookCommand = `"${ps}" -NoProfile -ExecutionPolicy Bypass -File "${hook}" -Mode gate`;
  const paths = [project, ...sources, hook, hookSource, join(project, '.git/HEAD'), join(project, '.git/config')];
  for (const [key, value] of Object.entries(env)) if (!['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'SKILLATOR_CLI'].includes(key)) paths.push(value);
  for (const item of paths) {
    const rel = relative(physical(root), physical(item));
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep) || lstatSync(item).isSymbolicLink()) throw new Error('Fixture path escaped containment');
  }
  if (readFileSync(join(project, '.git/HEAD'), 'utf8') !== 'ref: refs/heads/isolation\n' || readFileSync(join(project, '.git/config'), 'utf8') !== '[core]\n repositoryformatversion = 0\n bare = false\n') throw new Error('Fixture boundary changed');
  if (readFileSync(sources[0], 'utf8') !== `Isolation token: ${tokens[0]}\n` || readFileSync(sources[1], 'utf8') !== `Isolation token: ${tokens[1]}\n` || readFileSync(sources[2], 'utf8') !== `---\nname: isolation-probe\ndescription: Read-only isolation evidence probe.\n---\nIsolation token: ${tokens[2]}\n`) throw new Error('Fixture instructions changed');
  const commandContent = readFileSync(join(plugin, 'host-commands/antigravity/pending/SKILL.md'), 'utf8').replaceAll('\r', '').replaceAll('{{SKILLS}}', dest);
  if (readFileSync(sources[3], 'utf8') !== commandContent || !readFileSync(hook).equals(readFileSync(join(plugin, 'skills/watch-cortana/hooks/usage-watch.ps1')))) throw new Error('Fixture command/hook code changed');
  const expectedHooks = { hooks: { Stop: [{ hooks: [{ type: 'command', command: hookCommand, timeout: 10 }] }] } };
  if (JSON.stringify(JSON.parse(readFileSync(hookSource, 'utf8'))) !== JSON.stringify(expectedHooks)) throw new Error('Fixture hook definition changed');
  return { root, project, env, hookSource, hookCommand, expected: { sources, tokens, commandContent }, entries: [{ id: 'fixture-resume', ...outcome('passed', 'Existing fixture paths, instruction bytes, generated pending command and hook definition validated; authentication/trust not read or changed'), command: [], code: 0, evidence: { manifest: manifestPath } }] };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--selftest') return execute(process.execPath, ['--test', join(here, 'codex-isolation.test.mjs')], { stdio: 'inherit' }).status ?? 2;
  if (!['--offline', '--live'].includes(args[0]) || (args[0] === '--offline' && args.length !== 1 && !(args.length === 3 && args[1] === '--report')) ||
      (args[0] === '--live' && !((args.length === 5 || (args.length === 7 && args[5] === '--resume-fixture')) && args[1] === '--codex' && args[3] === '--report'))) {
    console.error('Usage: codex-isolation.mjs --selftest | --offline [--report FILE] | --live --codex ABSOLUTE_EXECUTABLE --report FILE [--resume-fixture ROOT]'); return 2;
  }
  let fixture;
  try { fixture = args[6] ? resumeFixture(args[6]) : runOffline(); } catch {
    const report = args[0] === '--live' ? args[4] : args[2];
    const result = { code: 2, entries: [{ id: 'fixture-isolation', ...outcome('blocked', 'Unsafe or unavailable temporary root/setup; no passing isolation claim'), command: [], code: null, evidence: {} }] };
    if (report) put(resolve(report), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result)); return 2;
  }
  if (args[0] === '--live') {
    const result = reportCode(fixture.entries) === 0 ? await liveCheck(resolve(args[2]), fixture) : outcome('blocked', 'Offline prerequisites failed');
    const { entries, ...summary } = result;
    fixture.entries.push(...(entries || [{ id: 'live-prerequisites', ...summary, command: [resolve(args[2])], code: null, evidence: {} }]));
    fixture.cliVersion = result.cliVersion;
  } else fixture.entries.push({ id: 'live-loading', ...outcome('skipped', 'Offline fixture only; F90/F105/A149 owner checks remain outstanding'), command: [], code: null, evidence: {} });
  const code = reportCode(fixture.entries);
  const report = resolve(args[0] === '--live' ? args[4] : args[2] || join(fixture.root, 'report.json'));
  put(report, JSON.stringify({ code, mode: args[0].slice(2), cliVersion: fixture.cliVersion, evidenceDirectory: fixture.root, entries: fixture.entries }, null, 2) + '\n');
  console.log(JSON.stringify({ code, report, entries: fixture.entries.map(({ id, status, reason }) => ({ id, status, reason })) }, null, 2));
  return code;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
