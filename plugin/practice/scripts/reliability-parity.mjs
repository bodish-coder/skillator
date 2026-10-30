// Offline reliability fixtures. No installer entrypoint or real coding host is started.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, openSync, closeSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../../..');
export const compare = (a, b) => ['code', 'stdout', 'stderr', 'files'].filter(k => !isDeepStrictEqual(a[k], b[k]));
export function normalizeBriefOutput(text, dir, shellRoot) {
  const path = dir.replaceAll('\\', '/') + '/.taskwork/task-3-brief.md';
  const aliases = [path, path.replaceAll('/', '\\'), shellRoot && shellRoot + '/.taskwork/task-3-brief.md'];
  return text.replaceAll('\r\n', '\n').split('\n').map(line => aliases.includes(line) ? '<fixture>/.taskwork/task-3-brief.md' : line).join('\n');
}
export function briefParityResult(observations, children) {
  if (children.some(e => e.status === 'blocked')) return { status: 'blocked', reason: 'Brief child execution blocked', code: null };
  if (children.some(e => e.status === 'failed')) return { status: 'failed', reason: 'Brief child execution or exact UTF-8 oracle failed', code: 1 };
  if (children.length !== 2 || observations.length !== 2 || children.some(e => e.status !== 'passed')) return { status: 'blocked', reason: 'Incomplete child observations', code: null };
  const diff = compare(...observations);
  return { status: diff.length ? 'failed' : 'passed', reason: diff.length ? 'Divergence: ' + diff.join(', ') : 'Output, exit status and relative file hashes agree; brief bytes match oracle', code: diff.length ? 1 : 0 };
}
export function reportCode(entries) {
  if (entries.some(e => e.status === 'failed')) return 1;
  if (entries.some(e => e.status === 'blocked') || !entries.some(e => e.status === 'passed')) return 2;
  return 0;
}
export function runFixture(command, options, evidence) {
  let stdout, stderr;
  try {
    stdout = openSync(evidence.stdout, 'w'); stderr = openSync(evidence.stderr, 'w');
    // Files avoid waiting for pipe EOF from a fixture's surviving descendants.
    return spawnSync(command[0], command.slice(1), { windowsHide: true, ...options, stdio: ['ignore', stdout, stderr] });
  } finally {
    if (stdout !== undefined) closeSync(stdout);
    if (stderr !== undefined) closeSync(stderr);
  }
}
function snapshot(dir, prefix = '') {
  const files = {};
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, snapshot(join(dir, entry.name), name + '/'));
    else files[name] = createHash('sha256').update(readFileSync(join(dir, entry.name))).digest('hex');
  }
  return files;
}
function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--selftest') {
    const result = spawnSync(process.execPath, ['--test', join(here, 'reliability-parity.test.mjs')], { stdio: 'inherit', windowsHide: true, timeout: 30000 });
    return result.status ?? 2;
  }
  if (args.length && !(args.length === 2 && args[0] === '--report')) {
    console.error('Usage: node reliability-parity.mjs [--selftest | --report FILE]');
    return 2;
  }
  const root = mkdtempSync(join(tmpdir(), 'reliability-parity-'));
  const entries = [];
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'gitconfig'), GIT_TERMINAL_PROMPT: '0' };
  for (const key of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/.test(key)) delete env[key];
  writeFileSync(env.GIT_CONFIG_GLOBAL, '[core]\n autocrlf = false\n[commit]\n gpgsign = false\n');
  const probe = (exe, argv) => spawnSync(exe, argv, { env, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  const sh = probe('sh', ['-c', 'exit 0']).status === 0 ? 'sh' : null;
  const ps = ['powershell', 'pwsh'].find(exe => probe(exe, ['-NoProfile', '-Command', 'exit 0']).status === 0);
  const git = probe('git', ['--version']).status === 0;
  const psArgs = file => ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file];
  function check(id, command, available = true, reason = '', cwd = repo) {
    const evidence = { stdout: join(root, id + '.stdout'), stderr: join(root, id + '.stderr') };
    if (!available) {
      const entry = { id, status: 'skipped', reason, command, cwd, code: null, evidence: {} };
      entries.push(entry); return entry;
    }
    console.log('Running ' + id);
    const r = runFixture(command, { cwd, env, timeout: 180000 }, evidence);
    const oversized = statSync(evidence.stdout).size + statSync(evidence.stderr).size > 8 * 1024 * 1024;
    const status = r.error || oversized ? 'blocked' : r.status === 0 ? 'passed' : 'failed';
    const entry = { id, status, reason: r.error?.message || (oversized ? 'Output exceeds 8 MiB inspection limit; see evidence files' : r.status === 0 ? 'Existing focused fixture assertions passed' : 'Fixture exited nonzero'), command, cwd, code: r.status, evidence };
    entries.push(entry);
    // Surface nested fixture skips individually; a green parent must not hide coverage gaps.
    const output = oversized ? '' : readFileSync(evidence.stdout, 'utf8') + '\n' + readFileSync(evidence.stderr, 'utf8');
    for (const [i, line] of output.split(/\r?\n/).filter(l => /^(?:skipped:|UNAVAILABLE:)|# SKIP|NOT checked/.test(l)).entries()) {
      entries.push({ id: `${id}-skip-${i + 1}`, status: 'skipped', reason: line.trim(), command, code: null, evidence });
    }
    return entry;
  }
  const both = Boolean(sh && ps);
  const missing = [!sh && 'sh', !ps && 'powershell/pwsh', !git && 'git'].filter(Boolean).join(', ');
  check('A166-A167-ownership', [ps || 'powershell/pwsh', ...psArgs('plugin/tests/ownership-parity.ps1')], both && process.platform === 'win32', 'Requires Windows ownership fixture and sh, powershell/pwsh; missing: ' + missing);
  check('A168-source-update', [process.execPath, '--test', 'plugin/tests/update-source.test.mjs'], git && both, 'Missing executable: ' + missing);
  check('A169-A171-quota', [ps || 'powershell/pwsh', ...psArgs('plugin/skills/watch-cortana/hooks/quota-source-selftest.ps1')], both, 'Missing executable: ' + missing);
  check('A172-shell', [sh || 'sh', 'plugin/skills/skillator-sync/scripts/skillator-sync.sh', '--selftest'], Boolean(sh && git), 'Missing executable: ' + missing);
  check('A172-powershell', [ps || 'powershell/pwsh', ...psArgs('plugin/skills/skillator-sync/scripts/skillator-sync.ps1'), '--selftest'], Boolean(ps && git && process.platform === 'win32'), 'Windows ACL/FileStream fixture requires Windows and powershell/pwsh, git; missing: ' + missing);
  check('A173-taskwork', [sh || 'sh', 'plugin/practice/scripts/selftest.sh'], both && git, 'Missing executable: ' + missing);
  if (both) {
    const observations = [];
    // The same Unicode/nested-fence input as A173; only temp paths/newlines in console transport normalize.
    const expected = '### Task 3: café\nRequirements: हिन्दी 中文\nFiles: café हिन्दी 中文 path/example.md\n````md\n```sh\nTASKS: café हिन्दी 中文 inside a nested fence\n```\n````\n';
    for (const port of ['sh', 'ps']) {
      const dir = join(root, port + ' path'); mkdirSync(dir);
      writeFileSync(join(dir, 'design.md'), expected + '### Task 4: adjacent\nMust not appear in task 3.\n');
      const command = port === 'sh' ? [sh, join(here, 'taskwork.sh').replaceAll('\\', '/'), 'brief', 'design.md', '3'] : [ps, ...psArgs(join(here, 'taskwork.ps1')), 'brief', 'design.md', '3'];
      const result = check('A173-bytes-' + port, command, true, '', dir);
      if (result.status !== 'passed') continue;
      const shellRoot = port === 'sh' ? spawnSync(sh, ['-c', 'pwd -P'], { cwd: dir, env, encoding: 'utf8', windowsHide: true, timeout: 10000 }).stdout?.trim() : null;
      const normalize = text => normalizeBriefOutput(text, dir, shellRoot);
      observations.push({ code: result.code, stdout: normalize(readFileSync(result.evidence.stdout, 'utf8')), stderr: normalize(readFileSync(result.evidence.stderr, 'utf8')), files: snapshot(dir) });
      if (!readFileSync(join(dir, '.taskwork/task-3-brief.md')).equals(Buffer.from(expected))) {
        result.status = 'failed'; result.reason = 'Brief differs from exact UTF-8 oracle';
      }
    }
    const evidence = join(root, 'A173-observations.json'); writeFileSync(evidence, JSON.stringify(observations, null, 2));
    entries.push({ id: 'A173-parity', ...briefParityResult(observations, entries.filter(e => e.id.startsWith('A173-bytes-'))), command: ['taskwork.sh', 'taskwork.ps1'], evidence: { observations: evidence } });
  } else entries.push({ id: 'A173-parity', status: 'skipped', reason: 'Missing executable: ' + missing, command: ['sh', 'powershell/pwsh'], code: null, evidence: {} });
  check('A170-shared-application', [process.execPath, 'plugin/skills/remote-cerebro/hooks/cerebro-bridge.mjs', 'selftest']);
  const ops = join(repo, 'plugin/mods/ops-board/ops');
  check('A174-A175-A176-shared-application', [process.execPath, '--import', './loader.mjs', '--test', '../pi/tests/ops.test.mts', '../antigravity/tests/ops.test.mts', 'tests/teams.test.mts', 'tests/state.test.mts', 'tests/messages.test.mts', 'tests/nodehost.test.mts', 'tests/mod-inbox.test.mts', 'tests/shutdown.test.mts', 'tests/status.test.mts', 'tests/runtab.test.mts', 'tests/app.test.mts'], git, 'Missing executable: git', ops);
  // Missing a shell prevents the required cross-port checks even if shared JS checks passed.
  if (!both || !git) entries.push({ id: 'required-prerequisites', status: 'blocked', reason: 'Required coverage incomplete; missing executable: ' + missing, command: [], code: null, evidence: {} });
  const code = reportCode(entries);
  const report = { code, evidenceDirectory: root, entries };
  const output = args[0] === '--report' ? resolve(args[1]) : join(root, 'report.json');
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ code, report: output, entries: entries.map(({ id, status, reason }) => ({ id, status, reason })) }, null, 2));
  return code;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
