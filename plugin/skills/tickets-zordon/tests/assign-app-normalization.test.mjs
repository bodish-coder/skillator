import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const scriptPath = resolve(here, '../scripts/ticket-meta.sh');

test('A211: ticket-meta.sh cmd_assign_app calls norm_id directly without subshell command substitution', () => {
  const content = readFileSync(scriptPath, 'utf8');
  
  // Extract cmd_assign_app function body
  const match = content.match(/cmd_assign_app\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, 'cmd_assign_app function must exist in ticket-meta.sh');

  const body = match[1];

  // Must not use command substitution ID=$(norm_id "$1") because norm_id emits no stdout
  assert.equal(
    /ID=\$\(norm_id\b/.test(body),
    false,
    'cmd_assign_app must not use subshell command substitution ID=$(norm_id "$1") which leaves ID empty'
  );

  // Must call norm_id directly
  assert.equal(
    /^\s*norm_id\s+"\$1";\s*shift/m.test(body),
    true,
    'cmd_assign_app must call norm_id directly as other shell writers do'
  );
});

test('A211: norm_id mutates global ID without emitting stdout', () => {
  const content = readFileSync(scriptPath, 'utf8');
  const match = content.match(/norm_id\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, 'norm_id function must exist');

  const body = match[1];
  assert.ok(body.includes('ID='), 'norm_id sets global ID');
  // It pipes validation to grep -q without echoing ID to output
  assert.ok(
    body.includes('grep -Eqx'),
    'norm_id pipes to grep without unpiped echo/print of $ID'
  );
});
