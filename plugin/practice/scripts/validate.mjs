// Fixed, offline repository checks. No coding host or service is launched.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, openSync, closeSync, statSync, truncateSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const statuses = ['passed', 'failed', 'skipped', 'blocked'];
const outputLimit = 8 * 1024 * 1024;
const cleanupMs = 5000;

export function childEnvironment(source = process.env, platform = process.platform) {
  const env = { ...source };
  if (platform !== 'win32') return { env };
  const keys = Object.keys(env).filter(key => key.toLowerCase() === 'path');
  const path = env[keys.sort()[0]] || '';
  const directories = path.split(';').map(dir => dir.replace(/^"|"$/g, '')).filter(dir => win32.isAbsolute(dir));
  const shell = directories.map(dir => win32.join(dir, 'sh.exe')).find(file => existsSync(file));
  if (!shell) return { env, error: 'Required POSIX runtime unavailable: sh.exe not found on PATH; install Git for Windows with its POSIX utilities' };
  // Git exposes sh in bin or usr/bin; utilities must come from that installation.
  const base = win32.dirname(shell);
  const directory = [base, win32.resolve(base, '../usr/bin')].find(dir =>
    ['sh', 'sort', 'grep', 'sed', 'awk'].every(name => existsSync(win32.join(dir, name + '.exe'))));
  if (!directory) return { env, error: 'Required POSIX utilities unavailable beside ' + shell + '; use a complete Git for Windows POSIX installation' };
  for (const key of keys) delete env[key];
  env.Path = directory + ';' + path;
  const probe = spawnSync(win32.join(directory, 'sort.exe'), [], { env, input: 'b\na\n', encoding: 'utf8', windowsHide: true, timeout: 3000, maxBuffer: 65536 });
  if (probe.error || probe.status !== 0 || probe.stdout !== 'a\nb\n') return { env, error: 'Required POSIX sort probe failed at ' + win32.join(directory, 'sort.exe') + '; expected LF-preserving POSIX sorting' };
  return { env };
}

export function registry(root, evidence) {
  const ps = process.platform === 'win32' ? 'powershell' : 'pwsh';
  const script = 'plugin/practice/scripts/';
  const check = (id, command, timeoutMs = 180000, extra = {}) => ({ id, command, cwd: root, timeoutMs, ...extra });
  const shell = (id, file, args = [], timeoutMs) => check(id, ['sh', file, ...args], timeoutMs, { prerequisites: [file], posix: true });
  const powershell = (id, file, args = [], timeoutMs) => check(id, [ps, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], timeoutMs, { prerequisites: [file], posix: true });
  const native = (id, file, args = [], extra = {}) => check(id, [process.execPath, file, ...args], 180000, { prerequisites: [file], ...extra });
  const parityReport = join(evidence, 'reliability-parity.json');
  const codexReport = join(evidence, 'codex-isolation.json');
  return [
    shell('routing', script + 'check-routing.sh'),
    shell('manifests', script + 'check-muse-manifest.sh'),
    shell('board', script + 'check-tickets.sh', ['TICKETS.md']),
    shell('context', script + 'context-audit.sh'),
    shell('grayskull-sync', script + 'check-grayskull-sync.sh'),
    shell('manifest-selftest', script + 'check-muse-manifest.sh', ['--selftest']),
    shell('board-selftest', script + 'check-tickets.sh', ['--selftest']),
    shell('context-selftest', script + 'context-audit.sh', ['selftest']),
    shell('taskwork-selftest', script + 'selftest.sh'),
    shell('installer-shell', 'plugin/install.sh', ['--selftest'], 30 * 60000),
    powershell('installer-powershell', 'plugin/install.ps1', ['-SelfTest'], 30 * 60000),
    native('reliability-selftest', script + 'reliability-parity.mjs', ['--selftest']),
    native('reliability-parity', script + 'reliability-parity.mjs', ['--report', parityReport], { timeoutMs: 30 * 60000, report: parityReport, posix: true }),
    native('codex-selftest', script + 'codex-isolation.mjs', ['--selftest']),
    native('codex-offline', script + 'codex-isolation.mjs', ['--offline', '--report', codexReport], { timeoutMs: 10 * 60000, report: codexReport }),
    check('validator-selftest', [process.execPath, '--test', script + 'validate.test.mjs']),
    check('ops-application', [process.execPath, '--import', './loader.mjs', '--test', 'tests/*.test.mts', '../pi/tests/*.test.mts', '../antigravity/tests/*.test.mts'], 10 * 60000, { cwd: join(root, 'plugin/mods/ops-board/ops'), prerequisites: ['loader.mjs'] }),
    native('generated-commands', script + 'generate-commands.mjs', ['--check'], { optional: !existsSync(join(root, script + 'generate-commands.mjs')), unavailableReason: 'F140 generator is absent; authoring decision pending' }),
  ];
}

// File descriptors avoid inherited-pipe EOF hangs. Polling bounds retained evidence
// and stops noisy children; a burst between polls may briefly exceed the limit.
async function execute(check, evidence, signal, log, env) {
  const started = Date.now();
  const entry = { id: check.id, status: 'blocked', reason: '', command: check.command, cwd: check.cwd, code: null, evidence, durationMs: 0 };
  let child, timer, pulse, stdout, stderr, stopping;
  let finish;
  const finished = new Promise(resolveDone => { finish = resolveDone; });
  const stop = reason => {
    if (stopping) return stopping;
    entry.status = reason === 'Interrupted' ? 'blocked' : 'failed';
    entry.reason = reason;
    stopping = (async () => {
      if (!child?.pid) return;
      if (process.platform === 'win32') {
        // /T includes descendants; kill while the root still exists, before reaping it.
        const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: cleanupMs, encoding: 'utf8', maxBuffer: 65536 });
        if (result.error || result.status !== 0) {
          entry.reason += '; process-tree cleanup could not be confirmed: ' + (result.error?.message || result.stderr?.trim() || `taskkill exit ${result.status}`);
          entry.cleanup = 'blocked';
          child.kill('SIGKILL');
        } else entry.cleanup = 'completed';
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); entry.cleanup = 'completed'; }
        catch (error) { if (error.code !== 'ESRCH') { entry.cleanup = 'blocked'; entry.reason += '; process-tree cleanup: ' + error.message; } }
      }
    })().catch(error => { entry.cleanup = 'blocked'; entry.reason += '; cleanup: ' + error.message; });
    // Do not wait for inherited streams or an unkillable child indefinitely.
    stopping.then(() => { timer = setTimeout(() => {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        entry.cleanup = 'blocked'; entry.reason += '; child did not exit within cleanup budget'; child.unref();
      }
      finish();
    }, cleanupMs); });
    return stopping;
  };
  const interrupt = () => { void stop('Interrupted'); };
  try {
    stdout = openSync(evidence.stdout, 'w'); stderr = openSync(evidence.stderr, 'w');
    child = spawn(check.command[0], check.command.slice(1), { cwd: check.cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', stdout, stderr] });
    child.once('error', error => { entry.reason = 'Cannot launch required runtime: ' + error.message; entry.status = check.optional ? 'skipped' : 'blocked'; finish(); });
    child.once('exit', (code, exitSignal) => {
      entry.code = code;
      if (!stopping) { entry.status = code === 0 ? 'passed' : check.report && code === 2 ? 'blocked' : 'failed'; entry.reason = code === 0 ? 'Assertions passed' : `Exited ${code ?? exitSignal}`; }
      finish();
    });
    signal?.addEventListener('abort', interrupt, { once: true });
    if (signal?.aborted) interrupt();
    pulse = setInterval(() => {
      if (Date.now() - started >= check.timeoutMs) void stop(`Timed out after ${check.timeoutMs} ms`);
      else if (statSync(evidence.stdout).size + statSync(evidence.stderr).size > (check.outputLimit ?? outputLimit)) void stop('Captured output limit exceeded');
    }, 50);
    const heartbeat = setInterval(() => log(`Running ${check.id}: ${Math.round((Date.now() - started) / 1000)}s / ${check.timeoutMs / 1000}s budget`), 30000);
    try { await finished; if (stopping) await stopping; } finally { clearInterval(heartbeat); }
    // Detached POSIX checks own a process group, including any leftover children.
    if (!stopping && child.pid && process.platform !== 'win32') {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  } catch (error) { entry.status = 'blocked'; entry.reason = error.message; if (child?.pid) await stop('Runner error: ' + error.message); }
  finally {
    clearInterval(pulse); clearTimeout(timer); signal?.removeEventListener('abort', interrupt);
    if (stdout !== undefined) closeSync(stdout); if (stderr !== undefined) closeSync(stderr);
    let remaining = check.outputLimit ?? outputLimit;
    for (const file of [evidence.stdout, evidence.stderr]) {
      if (!existsSync(file)) continue;
      const size = statSync(file).size;
      if (size > remaining) { truncateSync(file, remaining); if (!stopping) { entry.status = 'failed'; entry.reason = 'Captured output limit exceeded'; } }
      remaining -= Math.min(size, remaining);
    }
    entry.durationMs = Date.now() - started;
  }
  if (check.report && !stopping && child?.pid) {
    try {
      if (statSync(check.report).size > outputLimit) throw new Error('Nested report exceeds inspection limit');
      const report = JSON.parse(readFileSync(check.report, 'utf8'));
      if (!Array.isArray(report.entries) || !report.entries.length || report.entries.some(e => !statuses.includes(e.status) || typeof e.id !== 'string' || typeof e.reason !== 'string')) throw new Error('Invalid entries');
      entry.entries = report.entries; entry.evidence.report = check.report;
      if (report.entries.some(e => e.status === 'failed')) { entry.status = 'failed'; entry.reason = 'Nested check failed'; }
      else if (entry.status === 'passed' && (report.entries.some(e => e.status === 'blocked') || !report.entries.some(e => e.status === 'passed'))) { entry.status = 'blocked'; entry.reason = 'Nested coverage incomplete'; }
    } catch (error) { if (entry.status !== 'failed') entry.status = 'blocked'; entry.reason += '; Missing or invalid nested report: ' + error.message; }
  }
  return entry;
}

// The injected table is only an import-level test seam; the CLI always uses registry().
export async function runValidation({ checks, reportPath, evidenceDirectory, signal, log = console.log, env = process.env } = {}) {
  const evidence = evidenceDirectory || mkdtempSync(join(tmpdir(), 'skillator-validation-'));
  const output = resolve(reportPath || join(evidence, 'report.json'));
  const table = checks || registry(repo, evidence);
  const report = { code: 2, complete: false, interrupted: false, evidenceDirectory: evidence, summary: {}, entries: [] };
  const persist = () => {
    report.summary = Object.fromEntries(statuses.map(status => [status, report.entries.filter(e => e.status === status).length]));
    writeFileSync(output + '.tmp', JSON.stringify(report, null, 2) + '\n', 'utf8');
    renameSync(output + '.tmp', output);
  };
  // Verify report persistence before launching any check.
  persist();
  const runtime = table.some(check => check.posix) ? childEnvironment(env) : { env };
  for (const [index, check] of table.entries()) {
    let entry;
    const missing = (check.prerequisites || []).filter(file => !existsSync(resolve(check.cwd, file)));
    if (signal?.aborted || missing.length || (check.posix && runtime.error)) {
      entry = { id: check.id, status: signal?.aborted || !check.optional ? 'blocked' : 'skipped', reason: signal?.aborted ? 'Interrupted; check not started' : missing.length ? check.unavailableReason || 'Missing prerequisite: ' + missing.join(', ') : runtime.error, command: check.command, cwd: check.cwd, code: null, evidence: {} };
    } else {
      log(`[${index + 1}/${table.length}] Running ${check.id} (budget ${check.timeoutMs / 1000}s)`);
      entry = await execute(check, { stdout: join(evidence, `${index}.stdout`), stderr: join(evidence, `${index}.stderr`) }, signal, log, runtime.env);
    }
    report.entries.push(entry);
    log(`${entry.status}: ${entry.id} — ${entry.reason}`);
    persist();
  }
  report.interrupted = Boolean(signal?.aborted);
  report.complete = !report.interrupted && !report.entries.some(e => e.status === 'blocked' || e.cleanup === 'blocked');
  report.code = report.interrupted ? 2 : report.entries.some(e => e.status === 'failed') ? 1 : !report.complete || !report.entries.some(e => e.status === 'passed') ? 2 : 0;
  persist();
  log(`${statuses.map(s => `${report.summary[s]} ${s}`).join(', ')}; exit ${report.code}. Report: ${output}`);
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--report')) { console.error('Usage: node validate.mjs [--report FILE]'); return 2; }
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
  try { return (await runValidation({ reportPath: args[1], signal: controller.signal })).code; }
  catch (error) { console.error('Validation blocked: ' + error.message); return 2; }
  finally { process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
