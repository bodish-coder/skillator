// Offline app-server protocol fixture. Never forwards to a coding host.
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
const mode = process.argv[2];
const root = dirname(process.cwd());
const fixture = JSON.parse(readFileSync(join(root, 'fixture.json'), 'utf8'));
const emit = object => process.stdout.write(JSON.stringify(object) + '\n');
writeFileSync(join(root, 'stub.pid'), String(process.pid));
if (mode === 'timeout') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  writeFileSync(join(root, 'grandchild.pid'), String(child.pid));
  setInterval(() => {}, 1000);
}
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line), p = message.params;
  if (!message.id || mode === 'timeout') return;
  if (mode === 'malformed') return process.stdout.write('not JSON\n');
  const respond = result => emit({ id: message.id, result });
  const error = (code, text) => emit({ id: message.id, error: { code, message: text } });
  switch (message.method) {
    case 'initialize': return respond({ userAgent: 'offline-stub' });
    case 'skills/list': {
      if (mode === 'unsupported') return error(-32601, 'Method not found');
      const skills = ['isolation-probe', 'pending'].map((name, index) => ({ name, enabled: true, path: fixture.sources[index + 2] }));
      if (mode === 'external') skills.push({ name: 'external', enabled: true, path: fixture.external });
      return respond({ data: [{ cwd: process.cwd(), skills, errors: [] }] });
    }
    case 'hooks/list': {
      const config = JSON.parse(readFileSync(fixture.hookSource, 'utf8'));
      return respond({ data: [{ cwd: process.cwd(), errors: [], warnings: [], hooks: [{ eventName: 'stop', handlerType: 'command', sourcePath: fixture.hookSource, command: config.hooks.Stop[0].hooks[0].command, enabled: true, trustStatus: mode === 'untrusted' ? 'untrusted' : 'trusted' }] }] });
    }
    case 'thread/start':
      if (mode === 'auth') return error(401, 'Authentication required');
      if (p.sandbox !== 'read-only' || p.approvalPolicy !== 'never' || p.ephemeral !== true || p.cwd !== process.cwd()) return error(-1, 'Unsafe thread request');
      return respond({ thread: { id: 'thread-fixture' } });
    case 'turn/start': {
      if (p.threadId !== 'thread-fixture' || p.input.length !== 3 || p.input[1].type !== 'skill' || p.input[2].type !== 'skill' || p.input[1].path !== fixture.sources[2] || p.input[2].path !== fixture.sources[3]) return error(-1, 'Incorrect native injection');
      const params = { threadId: 'thread-fixture', turnId: 'turn-fixture' };
      emit({ method: 'item/completed', params: { ...params, item: { type: 'agentMessage', text: JSON.stringify({ tokens: mode === 'nonce' ? [] : fixture.tokens, commandContent: readFileSync(fixture.sources[3], 'utf8') }) } } });
      emit({ method: 'turn/completed', params: { ...params, turn: { id: 'turn-fixture', status: mode === 'failed' ? 'failed' : 'completed', error: mode === 'failed' ? { message: 'Upstream failed' } : null } } });
      return respond({ turn: { id: 'turn-fixture' } });
    }
    default: return error(-32601, 'Unexpected method');
  }
});
