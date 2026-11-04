import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_PATH = join(HERE, '..', 'references', 'templates.md');

export function extractNginxTemplate(markdown) {
  const match = markdown.match(/## 4\. `deploy\/nginx\.conf\.template`\s+```nginx\n([\s\S]*?)```/);
  if (!match) throw new Error('Could not find nginx.conf.template block in markdown');
  return match[1];
}

export function extractEnvsubstLine(markdown) {
  const match = markdown.match(/.*envsubst.*deploy\/nginx\.conf\.template.*/);
  if (!match) throw new Error('Could not find envsubst invocation in markdown');
  return match[0].trim();
}

export function substitute(template, allowlist, env) {
  if (allowlist) {
    const allowed = new Set(
      [...allowlist.matchAll(/\$([a-zA-Z_][a-zA-Z0-9_]*)|\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)]
        .map(m => m[1] || m[2])
    );
    return template.replace(
      /\$([a-zA-Z_][a-zA-Z0-9_]*)|\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
      (match, v1, v2) => {
        const v = v1 || v2;
        return allowed.has(v) ? (env[v] !== undefined ? env[v] : '') : match;
      }
    );
  }
  return template.replace(
    /\$([a-zA-Z_][a-zA-Z0-9_]*)|\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (match, v1, v2) => {
      const v = v1 || v2;
      return env[v] !== undefined ? env[v] : '';
    }
  );
}

export function validateNginxConfig(renderedConf) {
  const check = spawnSync('nginx', ['-v'], { encoding: 'utf8' });
  if (check.error || check.status !== 0) {
    return {
      available: false,
      reason: 'nginx binary is not available in PATH; skipping live nginx -t execution',
      report: 'UNAVAILABLE: nginx binary not found in environment'
    };
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'nginx-test-'));
  const confPath = join(tmpDir, 'nginx.conf');
  try {
    const fullConf = `events { worker_connections 1024; }\nhttp {\n${renderedConf}\n}\n`;
    writeFileSync(confPath, fullConf, 'utf8');
    const testRun = spawnSync('nginx', ['-t', '-c', confPath], { encoding: 'utf8' });
    return {
      available: true,
      exitCode: testRun.status,
      stdout: testRun.stdout,
      stderr: testRun.stderr,
      report: testRun.status === 0 ? 'VALID: nginx config passed -t' : 'INVALID: nginx -t failed'
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('templates.md specifies explicit envsubst allowlist and named placeholders', () => {
  const md = readFileSync(TEMPLATES_PATH, 'utf8');
  const envsubstLine = extractEnvsubstLine(md);
  const template = extractNginxTemplate(md);

  // Must not be unrestricted envsubst
  assert.equal(
    envsubstLine.includes("envsubst '$APP_DIR $SUBDOMAIN'") ||
    envsubstLine.includes("envsubst '${APP_DIR} ${SUBDOMAIN}'"),
    true,
    `Expected envsubst to include explicit allowlist, got: ${envsubstLine}`
  );

  // Must use named deployment placeholders instead of raw __SUBDOMAIN__ or __APP_DIR__
  assert.equal(template.includes('__SUBDOMAIN__'), false, 'Template still contains __SUBDOMAIN__');
  assert.equal(template.includes('__APP_DIR__'), false, 'Template still contains __APP_DIR__');
  assert.equal(
    template.includes('$SUBDOMAIN') || template.includes('${SUBDOMAIN}'),
    true,
    'Template must contain $SUBDOMAIN or ${SUBDOMAIN}'
  );
  assert.equal(
    template.includes('$APP_DIR') || template.includes('${APP_DIR}'),
    true,
    'Template must contain $APP_DIR or ${APP_DIR}'
  );
});

test('reproduce defect A187: unrestricted envsubst strips nginx runtime variables', () => {
  const md = readFileSync(TEMPLATES_PATH, 'utf8');
  const template = extractNginxTemplate(md);

  // If someone passed the template through unrestricted envsubst:
  const broken = substitute(template, null, { APP_DIR: '/opt/myapp', SUBDOMAIN: 'myapp.example.com' });

  // Nginx variables are consumed into empty expressions
  assert.match(broken, /set\s+0;/, 'Unrestricted envsubst produces empty set expression');
  assert.match(broken, /if\s*\(\s*=\s*1\)/, 'Unrestricted envsubst produces empty if expression');
  assert.match(broken, /proxy_set_header\s+Host\s+;/, 'Unrestricted envsubst produces empty Host header');
});

test('allowlisted envsubst preserves $uri, $host, $maintenance and replaces placeholders', () => {
  const md = readFileSync(TEMPLATES_PATH, 'utf8');
  const template = extractNginxTemplate(md);
  const env = { APP_DIR: '/opt/myapp', SUBDOMAIN: 'myapp.example.com' };
  const rendered = substitute(template, '$APP_DIR $SUBDOMAIN', env);

  // Preserved nginx runtime variables
  assert.match(rendered, /set\s+\$maintenance\s+0;/, 'Must preserve set $maintenance 0;');
  assert.match(rendered, /if\s*\(\s*\$maintenance\s*=\s*1\)/, 'Must preserve if ($maintenance = 1)');
  assert.match(rendered, /proxy_set_header\s+Host\s+\$host;/, 'Must preserve proxy_set_header Host $host;');
  assert.match(rendered, /try_files\s+\$uri\s+\$uri\/\s+\/index\.html;/, 'Must preserve try_files $uri $uri/ /index.html;');

  // Substituted deployment values
  assert.match(rendered, /server_name\s+myapp\.example\.com;/, 'Substitutes $SUBDOMAIN');
  assert.match(rendered, /root\s+\/opt\/myapp\/frontend\/dist;/, 'Substitutes $APP_DIR in root');
  assert.match(rendered, /if\s*\(-f\s+\/opt\/myapp\/maintenance\.flag\)/, 'Substitutes $APP_DIR in maintenance flag check');
  assert.match(rendered, /root\s+\/opt\/myapp;/, 'Substitutes $APP_DIR in location maintenance');

  // No unreplaced placeholders
  assert.equal(rendered.includes('$APP_DIR'), false, 'Should not have unreplaced $APP_DIR');
  assert.equal(rendered.includes('$SUBDOMAIN'), false, 'Should not have unreplaced $SUBDOMAIN');
  assert.equal(rendered.includes('__APP_DIR__'), false, 'Should not have __APP_DIR__');
  assert.equal(rendered.includes('__SUBDOMAIN__'), false, 'Should not have __SUBDOMAIN__');

  // No broken empty expressions
  assert.doesNotMatch(rendered, /set\s+0;/);
  assert.doesNotMatch(rendered, /if\s*\(\s*=\s*1\)/);
  assert.doesNotMatch(rendered, /proxy_set_header\s+Host\s+;/);
  assert.doesNotMatch(rendered, /try_files\s+\s+\/index\.html/);
});

test('validate resulting config or explicitly report unavailable nginx', () => {
  const md = readFileSync(TEMPLATES_PATH, 'utf8');
  const template = extractNginxTemplate(md);
  const env = { APP_DIR: '/opt/myapp', SUBDOMAIN: 'myapp.example.com' };
  const rendered = substitute(template, '$APP_DIR $SUBDOMAIN', env);

  const result = validateNginxConfig(rendered);
  assert.ok(typeof result.available === 'boolean');
  assert.ok(typeof result.report === 'string' && result.report.length > 0);

  if (result.available) {
    assert.equal(result.exitCode, 0, `nginx -t failed: ${result.stderr}`);
  } else {
    assert.match(result.reason, /nginx/i);
    assert.match(result.report, /UNAVAILABLE/);
  }
});
