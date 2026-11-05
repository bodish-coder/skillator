import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const templatesMdPath = resolve(here, 'templates.md');
const skillMdPath = resolve(here, '../SKILL.md');

export function extractDeployScript(markdown) {
  const sectionMatch = markdown.match(/## 3\.\s*`deploy\/deploy\.sh`([\s\S]*?)(?=---\s*|\n## [0-9]|$)/);
  assert.ok(sectionMatch, 'deploy.sh section should be found in templates.md');
  const codeBlockMatch = sectionMatch[1].match(/```bash\n([\s\S]*?)```/);
  assert.ok(codeBlockMatch, 'bash code block should be found in deploy.sh section');
  return codeBlockMatch[1];
}

/**
 * Control-flow simulator for deploy.sh.
 * Models set -euo pipefail semantics with external command mock responses.
 */
export function runDeployControlFlow(scriptText, mocks = {}) {
  const env = {
    apiRunning: mocks.apiRunning ?? true,
    backupOk: mocks.backupOk ?? true,
    nginxTestOk: mocks.nginxTestOk ?? true,
    nginxReloadOk: mocks.nginxReloadOk ?? true,
    certbotOk: mocks.certbotOk ?? true,
    apiHealthOk: mocks.apiHealthOk ?? true,
    httpsVerifyOk: mocks.httpsVerifyOk ?? true,
  };

  const logs = [];
  const errors = [];
  const steps = [];
  let exitCode = 0;
  let maintenanceFlag = false;

  const lines = scriptText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Skip empty lines or pure comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Pre-deploy backup gate block
    if (line.includes('docker compose ps --status running -q api')) {
      // Find matching fi
      let endIdx = i;
      while (endIdx < lines.length && lines[endIdx].trim() !== 'fi') {
        endIdx++;
      }
      const blockText = lines.slice(i, endIdx + 1).join('\n');
      i = endIdx;

      if (env.apiRunning) {
        steps.push('backup');
        if (!env.backupOk) {
          const dieM = blockText.match(/die\s+"([^"]+)"/);
          errors.push(`die: ${dieM ? dieM[1] : 'pre-deploy backup failed'}`);
          exitCode = 1;
          break;
        }
        const okM = blockText.match(/ok\s+"([^"]+)"/);
        if (okM) logs.push(`ok: ${okM[1]}`);
      } else {
        steps.push('backup-skipped-first-install');
        const warnM = blockText.match(/warn\s+"([^"]+)"/);
        if (warnM) errors.push(`warn: ${warnM[1]}`);
      }
      continue;
    }

    if (line.includes('npm run build')) {
      steps.push('frontend-build');
      continue;
    }

    if (line.includes('docker compose') && line.includes('up -d --build')) {
      steps.push('compose-up-build');
      continue;
    }

    // maintenance flag tracking
    if (line.includes('touch "$MAINT_FLAG"')) {
      maintenanceFlag = true;
      continue;
    }
    if (line.includes('rm -f "$MAINT_FLAG"')) {
      maintenanceFlag = false;
      continue;
    }

    // say / ok / warn / die output helpers
    const sayMatch = line.match(/^say\s+"([^"]+)"/);
    if (sayMatch) {
      logs.push(`say: ${sayMatch[1]}`);
      continue;
    }

    const okMatch = line.match(/^ok\s+"([^"]+)"/);
    if (okMatch) {
      logs.push(`ok: ${okMatch[1]}`);
      continue;
    }

    const warnMatch = line.match(/^warn\s+"([^"]+)"/);
    if (warnMatch) {
      errors.push(`warn: ${warnMatch[1]}`);
      continue;
    }

    // Handle command failures and gates
    // 1. API health wait loop
    if (line.includes('curl -fsS http://127.0.0.1:18000/api/health')) {
      if (!env.apiHealthOk) {
        errors.push('die: API never came up');
        exitCode = 1;
        break;
      }
      continue;
    }

    // 2. nginx -t
    if (line.includes('nginx -t')) {
      if (!env.nginxTestOk) {
        if (line.includes('die')) {
          const dieMatch = line.match(/die\s+"([^"]+)"/);
          errors.push(`die: ${dieMatch ? dieMatch[1] : 'nginx test failed'}`);
        } else {
          errors.push('error: nginx -t failed');
        }
        exitCode = 1;
        break;
      }
      // If combined with systemctl reload nginx on same line:
      if (line.includes('systemctl reload nginx')) {
        if (!env.nginxReloadOk) {
          if (line.includes('die')) {
            const dieMatch = line.match(/die\s+"([^"]+)"/);
            errors.push(`die: ${dieMatch ? dieMatch[1] : 'nginx reload failed'}`);
          } else {
            errors.push('error: systemctl reload nginx failed');
          }
          exitCode = 1;
          break;
        }
      }
      continue;
    }

    // systemctl reload nginx alone
    if (line.includes('systemctl reload nginx')) {
      if (!env.nginxReloadOk) {
        if (line.includes('die')) {
          const dieMatch = line.match(/die\s+"([^"]+)"/);
          errors.push(`die: ${dieMatch ? dieMatch[1] : 'nginx reload failed'}`);
        } else {
          errors.push('error: systemctl reload nginx failed');
        }
        exitCode = 1;
        break;
      }
      continue;
    }

    // 3. certbot
    if (line.startsWith('certbot --nginx') || line.includes('certbot --nginx')) {
      // Accumulate continuation lines if any
      let fullCertbotCmd = line;
      let j = i;
      while (fullCertbotCmd.endsWith('\\') && j + 1 < lines.length) {
        j++;
        fullCertbotCmd = fullCertbotCmd.slice(0, -1).trim() + ' ' + lines[j].trim();
      }
      i = j;

      if (!env.certbotOk) {
        if (fullCertbotCmd.includes('|| warn')) {
          const warnM = fullCertbotCmd.match(/warn\s+"([^"]+)"/);
          errors.push(`warn: ${warnM ? warnM[1] : 'TLS warning'}`);
          // Swallowing error leaves exitCode 0!
        } else if (fullCertbotCmd.includes('|| die')) {
          const dieM = fullCertbotCmd.match(/die\s+"([^"]+)"/);
          errors.push(`die: ${dieM ? dieM[1] : 'TLS failed'}`);
          exitCode = 1;
          break;
        } else {
          errors.push('error: certbot failed under set -e');
          exitCode = 1;
          break;
        }
      }
      continue;
    }

    // 4. HTTPS verification
    if (line.includes('https://$SUBDOMAIN') || line.includes('https://') && line.includes('curl')) {
      if (!env.httpsVerifyOk) {
        if (line.includes('die')) {
          const dieM = line.match(/die\s+"([^"]+)"/);
          errors.push(`die: ${dieM ? dieM[1] : 'HTTPS verification failed'}`);
        } else {
          errors.push('error: HTTPS verification failed');
        }
        exitCode = 1;
        break;
      }
      continue;
    }
  }

  const announcedLive = logs.some((l) => l.includes('ok: Live'));
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

  return {
    exitCode,
    logs,
    errors,
    steps,
    announcedLive,
    lastLog,
    maintenanceFlag,
  };
}

test('deploy.sh template static ordering and gates', () => {
  const templatesMd = readFileSync(templatesMdPath, 'utf8');
  const deployScript = extractDeployScript(templatesMd);

  const lines = deployScript.split('\n');
  const liveIndex = lines.findIndex((l) => l.trim() === 'ok "Live"');
  assert.ok(liveIndex >= 0, 'deploy.sh must contain ok "Live"');

  const nginxIndex = lines.findIndex((l) => l.includes('nginx -t'));
  assert.ok(nginxIndex >= 0, 'deploy.sh must contain nginx -t');

  const reloadIndex = lines.findIndex((l) => l.includes('systemctl reload nginx'));
  assert.ok(reloadIndex >= 0, 'deploy.sh must contain systemctl reload nginx');

  const certbotIndex = lines.findIndex((l) => l.includes('certbot --nginx'));
  assert.ok(certbotIndex >= 0, 'deploy.sh must contain certbot --nginx');

  const maintOffIndex = lines.findIndex((l) => l.includes('rm -f "$MAINT_FLAG"'));
  assert.ok(maintOffIndex >= 0, 'deploy.sh must contain rm -f "$MAINT_FLAG"');

  const httpsVerifyIndex = lines.findIndex((l) => l.includes('curl') && l.includes('https://'));
  assert.ok(httpsVerifyIndex >= 0, 'deploy.sh must contain HTTPS curl verification');

  // Verify ordering: ok "Live" must come AFTER all verification and maintenance handling
  assert.ok(liveIndex > nginxIndex, 'ok "Live" must be emitted after nginx -t');
  assert.ok(liveIndex > reloadIndex, 'ok "Live" must be emitted after systemctl reload nginx');
  assert.ok(liveIndex > certbotIndex, 'ok "Live" must be emitted after certbot TLS setup');
  assert.ok(liveIndex > maintOffIndex, 'ok "Live" must be emitted after maintenance gate is cleared');
  assert.ok(liveIndex > httpsVerifyIndex, 'ok "Live" must be emitted after HTTPS verification');

  // Required TLS gate: certbot errors must NOT be swallowed by || warn
  const certbotSnippet = lines.slice(certbotIndex, certbotIndex + 4).join(' ');
  assert.ok(!certbotSnippet.includes('|| warn'), 'certbot command must not downgrade failure to warn');
  assert.ok(certbotSnippet.includes('|| die'), 'certbot command must fail with die on error');
});

test('control flow: certbot failure must fail deploy and never announce Live', () => {
  const templatesMd = readFileSync(templatesMdPath, 'utf8');
  const deployScript = extractDeployScript(templatesMd);

  const res = runDeployControlFlow(deployScript, { certbotOk: false });
  assert.notEqual(res.exitCode, 0, 'Deploy must exit non-zero when certbot fails');
  assert.equal(res.announcedLive, false, 'Live must not be announced when certbot fails');
});

test('control flow: nginx -t failure must fail deploy and never announce Live', () => {
  const templatesMd = readFileSync(templatesMdPath, 'utf8');
  const deployScript = extractDeployScript(templatesMd);

  const res = runDeployControlFlow(deployScript, { nginxTestOk: false });
  assert.notEqual(res.exitCode, 0, 'Deploy must exit non-zero when nginx -t fails');
  assert.equal(res.announcedLive, false, 'Live must not be announced when nginx -t fails');
});

test('control flow: nginx reload failure must fail deploy and never announce Live', () => {
  const templatesMd = readFileSync(templatesMdPath, 'utf8');
  const deployScript = extractDeployScript(templatesMd);

  const res = runDeployControlFlow(deployScript, { nginxReloadOk: false });
  assert.notEqual(res.exitCode, 0, 'Deploy must exit non-zero when systemctl reload nginx fails');
  assert.equal(res.announcedLive, false, 'Live must not be announced when systemctl reload nginx fails');
});

test('control flow: HTTPS verification failure must fail deploy and never announce Live', () => {
  const templatesMd = readFileSync(templatesMdPath, 'utf8');
  const deployScript = extractDeployScript(templatesMd);

  const res = runDeployControlFlow(deployScript, { httpsVerifyOk: false });
  assert.notEqual(res.exitCode, 0, 'Deploy must exit non-zero when HTTPS verification fails');
  assert.equal(res.announcedLive, false, 'Live must not be announced when HTTPS verification fails');
});

test('control flow: successful deploy announces ok "Live" as final success message', () => {
  const templatesMd = readFileSync(templatesMdPath, 'utf8');
  const deployScript = extractDeployScript(templatesMd);

  const res = runDeployControlFlow(deployScript, {});
  assert.equal(res.exitCode, 0, 'Successful deploy must exit 0');
  assert.equal(res.announcedLive, true, 'Successful deploy must announce Live');
  assert.equal(res.lastLog, 'ok: Live', 'ok "Live" must be the final message');
  assert.equal(res.maintenanceFlag, false, 'Maintenance flag must be cleared on success');
});

test('SKILL.md documentation contract: TLS is a required gate and Live follows verification', () => {
  const skillMd = readFileSync(skillMdPath, 'utf8');
  assert.ok(
    skillMd.includes('TLS') && (skillMd.includes('gate') || skillMd.includes('strict gate')),
    'SKILL.md must document TLS as a required gate'
  );
  assert.ok(
    skillMd.includes('Live') && (skillMd.includes('verification') || skillMd.includes('after all verification')),
    'SKILL.md must document that Live follows all verification'
  );
});
