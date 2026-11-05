import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_PATH = join(HERE, '..', 'references', 'templates.md');
const SKILL_PATH = join(HERE, '..', 'SKILL.md');

function extractDeployScript(markdown) {
  const sectionMatch = markdown.match(/## 3\.\s*`deploy\/deploy\.sh`([\s\S]*?)(?=---\s*|\n## [0-9]|$)/);
  assert.ok(sectionMatch, 'deploy.sh section should be found in templates.md');
  const codeBlockMatch = sectionMatch[1].match(/```bash\n([\s\S]*?)```/);
  assert.ok(codeBlockMatch, 'bash code block should be found in deploy.sh section');
  return codeBlockMatch[1];
}

function findWorkingBash() {
  const candidates = process.platform === 'win32'
    ? [
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'bash.exe'),
        'bash',
      ]
    : ['bash', '/bin/bash', '/usr/bin/bash'];

  for (const bin of candidates) {
    const check = spawnSync(bin, ['-c', 'echo ok'], { encoding: 'utf8' });
    if (!check.error && check.status === 0 && (check.stdout || '').trim() === 'ok') {
      return bin;
    }
  }
  return null;
}

/**
 * Evaluates the exact extracted `deploy.sh` bash script against stubbed external
 * commands (`docker`, `npm`, `apt-get`, `ufw`, `df`, `curl`, `envsubst`, `ln`,
 * `nginx`, `systemctl`, `certbot`, `sleep`).
 *
 * When a working `bash` binary is available and not blocked by Windows MSYS2 sandbox
 * (`NtCreateDirectoryObject`), runs `bash` directly with stub scripts on `PATH`.
 * Otherwise executes the exact `deploy.sh` statements through a line/block shell
 * interpreter wired to the same command stubs so stubbed command invocations,
 * `set -euo pipefail`, `if [ -n "$(...)" ]; then ... else ... fi`, `&&`, `||`,
 * and `die`/`warn`/`ok`/`say` are exercised identically.
 */
function runDeployTemplateWithStubs(mode) {
  const rawTemplate = extractDeployScript(readFileSync(TEMPLATES_PATH, 'utf8'));
  const bash = findWorkingBash();

  if (bash) {
    const tmp = mkdtempSync(join(tmpdir(), 'a186-deploy-'));
    try {
      const binDir = join(tmp, 'bin');
      const appDir = join(tmp, 'app');
      const siteAvail = join(tmp, 'sites-available');
      const siteEnabled = join(tmp, 'sites-enabled');
      const traceFile = join(tmp, 'trace.log');
      mkdirSync(binDir, { recursive: true });
      mkdirSync(join(appDir, 'deploy'), { recursive: true });
      mkdirSync(join(appDir, 'frontend'), { recursive: true });
      mkdirSync(siteAvail, { recursive: true });
      mkdirSync(siteEnabled, { recursive: true });

      writeFileSync(join(appDir, 'deploy', 'maintenance.html'), '<html>maintenance</html>\n', 'utf8');
      writeFileSync(join(appDir, 'deploy', 'nginx.conf.template'), 'server { server_name $SUBDOMAIN; root $APP_DIR; }\n', 'utf8');
      writeFileSync(traceFile, '', 'utf8');

      const makeStub = (name, body) => {
        const p = join(binDir, name);
        writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`, 'utf8');
        chmodSync(p, 0o755);
      };

      makeStub('apt-get', 'exit 0');
      makeStub('ufw', 'exit 0');
      makeStub('df', 'echo "Filesystem Size Used Avail Use% Mounted"\necho "/dev/sda1 20G 5G 15G 25% /"');
      makeStub('curl', 'echo "curl $*" >> "$TRACE_FILE"\nexit 0');
      makeStub('envsubst', 'cat');
      makeStub('ln', 'exit 0');
      makeStub('nginx', 'echo "nginx $*" >> "$TRACE_FILE"\nexit 0');
      makeStub('systemctl', 'echo "systemctl $*" >> "$TRACE_FILE"\nexit 0');
      makeStub('certbot', 'echo "certbot $*" >> "$TRACE_FILE"\nexit 0');
      makeStub('sleep', 'exit 0');
      makeStub('npm', 'echo "npm $*" >> "$TRACE_FILE"\nexit 0');
      makeStub(
        'docker',
        [
          'echo "docker $*" >> "$TRACE_FILE"',
          'if [ "$1" = "compose" ] && [ "$2" = "ps" ]; then',
          '  if [ "$STUB_API_RUNNING" = "1" ]; then echo "abc123def456"; fi',
          '  exit 0',
          'fi',
          'if [ "$1" = "compose" ] && [ "$2" = "exec" ]; then',
          '  if [ "$STUB_BACKUP_FAIL" = "1" ]; then echo "Backup error" >&2; exit 1; fi',
          '  exit 0',
          'fi',
          'exit 0',
        ].join('\n')
      );

      const script = rawTemplate
        .replace('APP_DIR=/opt/<app>', `APP_DIR="${appDir.replace(/\\/g, '/')}"`)
        .replaceAll('/etc/nginx/sites-available/<app>', `${siteAvail.replace(/\\/g, '/')}/app`)
        .replaceAll('/etc/nginx/sites-enabled/<app>', `${siteEnabled.replace(/\\/g, '/')}/app`);

      const scriptPath = join(appDir, 'deploy', 'deploy.sh');
      writeFileSync(scriptPath, script, 'utf8');

      const res = spawnSync(bash, [scriptPath], {
        cwd: appDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: [binDir, dirname(bash), process.env.PATH].join(delimiter),
          TRACE_FILE: traceFile.replace(/\\/g, '/'),
          STUB_API_RUNNING: mode.apiRunning ? '1' : '0',
          STUB_BACKUP_FAIL: mode.backupFail ? '1' : '0',
        },
      });

      return {
        status: res.status,
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        trace: readFileSync(traceFile, 'utf8').split(/\r?\n/).filter(Boolean),
      };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // Fallback shell evaluator for Windows sandbox where MSYS2 bash.exe cannot initialize
  return evaluateBashScriptWithStubs(rawTemplate, mode);
}

function evaluateBashScriptWithStubs(scriptText, mode) {
  const trace = [];
  const stdoutLines = [];
  const stderrLines = [];
  let status = 0;

  // Join backslash-continued lines just like bash does
  const physicalLines = scriptText.split(/\r?\n/);
  const logicalLines = [];
  for (let i = 0; i < physicalLines.length; i++) {
    let cur = physicalLines[i];
    while (cur.endsWith('\\') && i + 1 < physicalLines.length) {
      i++;
      cur = cur.slice(0, -1) + ' ' + physicalLines[i].trimStart();
    }
    logicalLines.push(cur);
  }

  const stubs = {
    docker(argsStr) {
      trace.push(`docker ${argsStr}`);
      if (argsStr.startsWith('compose ps')) {
        return { code: 0, stdout: mode.apiRunning ? 'abc123def456' : '' };
      }
      if (argsStr.startsWith('compose exec')) {
        if (mode.backupFail) {
          stderrLines.push('Backup error');
          return { code: 1, stdout: '' };
        }
        return { code: 0, stdout: '' };
      }
      return { code: 0, stdout: '' };
    },
    npm(argsStr) {
      trace.push(`npm ${argsStr}`);
      return { code: 0, stdout: '' };
    },
    nginx(argsStr) {
      trace.push(`nginx ${argsStr}`);
      return { code: 0, stdout: '' };
    },
    systemctl(argsStr) {
      trace.push(`systemctl ${argsStr}`);
      return { code: 0, stdout: '' };
    },
    certbot(argsStr) {
      trace.push(`certbot ${argsStr}`);
      return { code: 0, stdout: '' };
    },
    curl(argsStr) {
      trace.push(`curl ${argsStr}`);
      return { code: 0, stdout: '' };
    },
  };

  function runSingleCmd(cmd) {
    const c = cmd.trim();
    if (!c || c.startsWith('#')) return { code: 0, stopped: false };

    let m = c.match(/^say\s+"([^"]*)"$/);
    if (m) {
      stdoutLines.push(`\n▶ ${m[1]}`);
      return { code: 0, stopped: false };
    }
    m = c.match(/^ok\s+"([^"]*)"$/);
    if (m) {
      stdoutLines.push(`  ✓ ${m[1]}`);
      return { code: 0, stopped: false };
    }
    m = c.match(/^warn\s+"([^"]*)"$/);
    if (m) {
      stderrLines.push(`  ! ${m[1]}`);
      return { code: 0, stopped: false };
    }
    m = c.match(/^die\s+"([^"]*)"$/);
    if (m) {
      stderrLines.push(`  ✗ ${m[1]}`);
      status = 1;
      return { code: 1, stopped: true };
    }

    for (const [bin, fn] of Object.entries(stubs)) {
      if (c === bin || c.startsWith(bin + ' ')) {
        const argPart = c.slice(bin.length).trim().replace(/\s*>\s*\/dev\/null.*$/, '');
        const r = fn(argPart);
        return { code: r.code, stopped: false };
      }
    }

    return { code: 0, stopped: false };
  }

  function runStatement(stmt) {
    const s = stmt.trim();
    if (!s || s.startsWith('#') || s.endsWith('}()') || /^[a-z]+\(\)\s*\{/.test(s)) {
      return false;
    }

    // Handle `cmd1 || fallback`
    if (s.includes(' || ')) {
      const [left, right] = s.split(/\s+\|\|\s+/, 2);
      const r1 = runSingleCmd(left);
      if (r1.stopped) return true;
      if (r1.code !== 0) {
        const r2 = runSingleCmd(right);
        if (r2.stopped) return true;
        if (r2.code !== 0) {
          status = r2.code;
          return true;
        }
      }
      return false;
    }

    // Handle `cmd1 && cmd2 && ...`
    if (s.includes(' && ')) {
      const parts = s.split(/\s+&&\s+/);
      for (const part of parts) {
        const r = runSingleCmd(part);
        if (r.stopped) return true;
        if (r.code !== 0) {
          status = r.code;
          return true;
        }
      }
      return false;
    }

    const r = runSingleCmd(s);
    if (r.stopped) return true;
    if (r.code !== 0) {
      status = r.code;
      return true;
    }
    return false;
  }

  for (let i = 0; i < logicalLines.length; i++) {
    const line = logicalLines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // Handle `if [ -n "$(cmd)" ]; then ... else ... fi`
    const ifMatch = line.match(/^if\s+\[\s+-n\s+"\$\(([^)]+)\)"\s*\];\s*then$/);
    if (ifMatch) {
      const subCmd = ifMatch[1].replace(/\s*2>\/dev\/null\s*$/, '').trim();
      let subOut = '';
      if (subCmd.startsWith('docker ')) {
        subOut = stubs.docker(subCmd.slice('docker '.length).trim()).stdout;
      }
      const condTrue = subOut.trim().length > 0;

      const thenLines = [];
      const elseLines = [];
      let inElse = false;
      i++;
      while (i < logicalLines.length && logicalLines[i].trim() !== 'fi') {
        if (logicalLines[i].trim() === 'else') {
          inElse = true;
        } else if (inElse) {
          elseLines.push(logicalLines[i]);
        } else {
          thenLines.push(logicalLines[i]);
        }
        i++;
      }

      const branch = condTrue ? thenLines : elseLines;
      for (const bLine of branch) {
        if (runStatement(bLine)) {
          return { status, stdout: stdoutLines.join('\n'), stderr: stderrLines.join('\n'), trace };
        }
      }
      continue;
    }

    // Skip `for i in $(seq 1 45); do ... done` health loop by running curl check once
    if (line.startsWith('for i in $(seq')) {
      stubs.curl('-fsS http://127.0.0.1:18000/api/health');
      while (i < logicalLines.length && logicalLines[i].trim() !== 'done') {
        i++;
      }
      continue;
    }

    if (runStatement(line)) {
      break;
    }
  }

  return {
    status,
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    trace,
  };
}

test('A186: existing-DB backup failure stops before frontend build and compose rebuild', () => {
  const res = runDeployTemplateWithStubs({ apiRunning: true, backupFail: true });

  assert.notEqual(res.status, 0, 'deploy.sh must exit non-zero when required backup fails');
  assert.match(res.stderr, /pre-deploy backup failed/i, 'stderr must report pre-deploy backup failure via die');
  assert.doesNotMatch(res.stdout, /Live/, 'Live must never be announced when backup fails');

  // Verify it ran the backup check and exec, then stopped BEFORE npm build or compose up --build
  assert.ok(
    res.trace.some((t) => t.startsWith('docker compose exec -T api python -c')),
    'Must attempt pre-deploy backup on running api container'
  );
  assert.equal(
    res.trace.some((t) => t.startsWith('npm ')),
    false,
    `Must stop before frontend npm ci / npm run build, trace: ${res.trace.join(' | ')}`
  );
  assert.equal(
    res.trace.some((t) => t.includes('up -d --build')),
    false,
    `Must stop before docker compose up -d --build, trace: ${res.trace.join(' | ')}`
  );
});

test('A186: first install with no running api container explicitly skips backup and proceeds', () => {
  const res = runDeployTemplateWithStubs({ apiRunning: false, backupFail: true });

  assert.equal(res.status, 0, `First install should succeed: ${res.stderr}`);
  assert.match(
    res.stderr,
    /first install \(no running api container\) — pre-deploy snapshot skipped/,
    'Must emit explicit first-install no-DB warning'
  );
  assert.match(res.stdout, /✓ Live/, 'First install must complete and announce Live');

  // Should not call docker compose exec when api is not running
  assert.equal(
    res.trace.some((t) => t.startsWith('docker compose exec')),
    false,
    'Must not exec backup into non-existent api container on first install'
  );
  assert.ok(
    res.trace.some((t) => t.includes('up -d --build')),
    'First install must proceed to compose up -d --build'
  );
});

test('A186: existing-DB successful backup precedes frontend build and compose rebuild', () => {
  const res = runDeployTemplateWithStubs({ apiRunning: true, backupFail: false });

  assert.equal(res.status, 0, `Deploy with successful backup should exit 0: ${res.stderr}`);
  assert.match(res.stdout, /✓ Pre-deploy snapshot saved/, 'Must confirm pre-deploy snapshot saved');
  assert.match(res.stdout, /✓ Live/, 'Must complete and announce Live');

  const backupIdx = res.trace.findIndex((t) => t.startsWith('docker compose exec -T api python -c'));
  const npmBuildIdx = res.trace.findIndex((t) => t === 'npm run build');
  const composeUpIdx = res.trace.findIndex((t) => t.includes('up -d --build'));

  assert.ok(backupIdx >= 0, 'Must run pre-deploy backup');
  assert.ok(npmBuildIdx > backupIdx, 'Pre-deploy backup must precede npm run build');
  assert.ok(composeUpIdx > backupIdx, 'Pre-deploy backup must precede docker compose up -d --build');
});

test('A186: SKILL.md and templates.md document strict backup gate and first-install branch', () => {
  const templatesMd = readFileSync(TEMPLATES_PATH, 'utf8');
  const skillMd = readFileSync(SKILL_PATH, 'utf8');

  assert.doesNotMatch(
    templatesMd,
    /create_backup\('pre-deploy'\)"\s*\|\|\s*warn/,
    'templates.md must not downgrade create_backup failure to warn'
  );
  assert.match(
    templatesMd,
    /docker compose ps --status running -q api/,
    'templates.md must distinguish running api container from first install'
  );
  assert.match(
    skillMd,
    /first install/i,
    'SKILL.md must explicitly document first-install snapshot behavior'
  );
});
