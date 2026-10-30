// One bounded stdio app-server session; protocol shapes from OpenAI app-server docs.
import { spawn, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';

const entry = (id, status, reason, evidence = {}) => ({ id, status, reason, command: [], code: status === 'passed' ? 0 : null, evidence });
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const physical = path => {
  const value = realpathSync(path);
  return process.platform === 'win32' ? value.toLowerCase() : value;
};
const contained = (root, path) => { const rel = relative(physical(root), physical(path)); return rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(rel); };
function protocolError(error) {
  if (error?.code === -32601) return 'Native method unsupported by selected CLI';
  if (/auth|login|sign.?in|unauthorized|401/i.test(error?.message || '')) return 'Native CLI reports authentication required';
  if (/untrusted|hook.*trust|trust.*hook/i.test(error?.message || '')) return 'Native CLI reports hook trust required';
  return 'Native request failed (raw response withheld)';
}

export async function nativeProbe(exe, fixture, { prefix = [], timeout = 60000 } = {}) {
  const entries = [];
  const argv = [...prefix, 'app-server'];
  let child, timer, failure, serial = 0, bytes = 0, buffer = '';
  const pending = new Map(), events = [];
  let eventWaiter;
  const fail = reason => {
    failure ||= new Error(reason);
    for (const waiter of pending.values()) waiter.reject(failure);
    pending.clear(); eventWaiter?.();
  };
  const send = value => child.stdin.write(JSON.stringify(value) + '\n');
  const request = (method, params) => new Promise((resolve, reject) => {
    if (failure) return reject(failure);
    const id = ++serial; pending.set(id, { resolve, reject }); send({ id, method, params });
  });
  try {
    child = spawn(exe, argv, { cwd: fixture.project, env: fixture.env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    child.on('error', () => fail('Native executable unavailable'));
    child.on('exit', () => fail('Native process exited before completion'));
    child.stdin.on('error', () => fail('Native input closed'));
    child.stderr.on('data', chunk => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) fail('Native output budget exceeded'); });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      bytes += Buffer.byteLength(chunk); if (bytes > 2 * 1024 * 1024) return fail('Native output budget exceeded');
      buffer += chunk;
      while (buffer.includes('\n')) {
        const split = buffer.indexOf('\n'), line = buffer.slice(0, split); buffer = buffer.slice(split + 1);
        let message; try { message = JSON.parse(line); } catch { return fail('Malformed native JSON response'); }
        if (message.method && message.id != null) {
          send({ id: message.id, error: { code: -32601, message: 'Isolation probe does not grant approvals or serve tools' } });
          return fail('Native session requested an unsupported approval/tool operation');
        }
        if (message.id != null) {
          const waiter = pending.get(message.id);
          if (!waiter) return fail('Unexpected native response ID');
          pending.delete(message.id);
          if (message.error) waiter.reject(new Error(protocolError(message.error)));
          else if ('result' in message) waiter.resolve(message.result);
          else waiter.reject(new Error('Malformed native response envelope'));
        } else if (message.method) { events.push(message); eventWaiter?.(); }
        else return fail('Malformed native event envelope');
      }
    });
    timer = setTimeout(() => fail('Native protocol timeout'), timeout);
    await request('initialize', { clientInfo: { name: 'skillator-isolation', version: '1.0.0' } });
    send({ method: 'initialized', params: {} });
    const inventory = await request('skills/list', { cwds: [fixture.project], forceReload: true });
    const row = inventory?.data?.length === 1 && inventory.data[0];
    if (!row || physical(row.cwd) !== physical(fixture.project) || !Array.isArray(row.skills) || !Array.isArray(row.errors) || row.errors.length) throw new Error('Unsupported or incomplete native skill inventory');
    const skills = row.skills;
    const expected = [
      { name: 'isolation-probe', path: fixture.expected.sources[2] },
      { name: 'pending', path: fixture.expected.sources[3] },
    ];
    if (skills.some(skill => typeof skill.path !== 'string' || !contained(join(fixture.env.CODEX_HOME, 'skills'), skill.path))) {
      entries.push(entry('live-native-discovery', 'failed', 'Native inventory contains unexpected external skill sources')); return entries;
    }
    if (!expected.every(target => skills.filter(skill => skill.name === target.name && skill.enabled === true && physical(skill.path) === physical(target.path)).length === 1)) {
      entries.push(entry('live-native-discovery', 'failed', 'Native inventory missing or duplicating expected enabled skill/command sources')); return entries;
    }
    entries.push(entry('live-native-discovery', 'passed', 'Native skills/list confirms fixture skill and generated command sources', { skills: expected, method: 'skills/list' }));
    try {
      const hooks = await request('hooks/list', { cwds: [fixture.project] });
      const list = hooks?.data?.length === 1 && hooks.data[0];
      if (!list || physical(list.cwd) !== physical(fixture.project) || !Array.isArray(list.hooks) || !Array.isArray(list.errors) || list.errors.length) throw new Error('Unsupported or incomplete native hook inventory');
      if (list.hooks.some(h => !contained(fixture.root, h.sourcePath))) {
        entries.push(entry('live-native-hooks', 'failed', 'Native hook inventory contains unexpected external sources')); return entries;
      }
      const hook = list.hooks.find(h => h.eventName === 'stop' && physical(h.sourcePath) === physical(fixture.hookSource) && h.handlerType === 'command' && h.command === fixture.hookCommand);
      if (!hook) entries.push(entry('live-native-hooks', 'blocked', 'Fixture Stop hook not discovered by native hooks/list'));
      else if (['untrusted', 'modified'].includes(hook.trustStatus)) entries.push(entry('live-native-hooks', 'blocked', 'Native hooks/list reports fixture hook ' + hook.trustStatus));
      else if (!hook.enabled || !['trusted', 'managed'].includes(hook.trustStatus)) entries.push(entry('live-native-hooks', 'blocked', 'Native fixture hook disabled or trust status unsupported'));
      else entries.push(entry('live-native-hooks', 'passed', 'Native hooks/list confirms configured fixture Stop hook and trust; execution remains a separate owner check', { source: fixture.hookSource, event: 'stop', trustStatus: hook.trustStatus }));
    } catch (error) { entries.push(entry('live-native-hooks', 'blocked', error.code ? 'Native hook source path unavailable' : error.message)); }
    const thread = await request('thread/start', { cwd: fixture.project, sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true });
    const threadId = thread?.thread?.id;
    if (typeof threadId !== 'string') throw new Error('Missing native thread ID');
    const input = [
      { type: 'text', text: 'Read-only isolation check. Inspect the injected $isolation-probe and $pending instructions without executing either workflow or tools. Return JSON with tokens (three isolation tokens from active project/global instructions and injected probe) and commandContent (exact complete injected pending SKILL.md text). Do not read files, run commands, change trust or credentials, or perform the pending workflow.' },
      ...expected.map(skill => ({ type: 'skill', ...skill })),
    ];
    const started = await request('turn/start', { threadId, input });
    const turnId = started?.turn?.id;
    if (typeof turnId !== 'string') throw new Error('Missing native turn ID');
    let completed, text;
    while (!completed) {
      if (failure) throw failure;
      while (events.length) {
        const event = events.shift(), p = event.params;
        if (p?.threadId !== threadId || (p?.turnId || p?.turn?.id) !== turnId) continue;
        if (event.method === 'item/completed' && p.item?.type === 'agentMessage') text = p.item.text;
        if (event.method === 'turn/completed') completed = p.turn;
      }
      if (!completed) await new Promise(resolve => { eventWaiter = resolve; });
      eventWaiter = null;
    }
    if (completed.status !== 'completed') throw new Error(protocolError(completed.error));
    let observed; try { observed = JSON.parse(text); } catch { throw new Error('Malformed injected-skill response'); }
    if (!Array.isArray(observed.tokens) || !same(observed.tokens, fixture.expected.tokens) || observed.commandContent !== fixture.expected.commandContent) {
      entries.push(entry('live-native-loading', 'failed', 'Native injection completed but fixture-only nonce/command evidence differs'));
    } else entries.push(entry('live-native-loading', 'passed', 'Native skill input accepted and completed; exact fixture-only instruction tokens and generated command text recovered', { injected: expected, tokens: fixture.expected.tokens, methods: ['thread/start', 'turn/start', 'turn/completed'] }));
  } catch (error) {
    entries.push(entry(entries.some(e => e.id === 'live-native-discovery') ? 'live-native-loading' : 'live-native-discovery', 'blocked', error.code ? 'Native inventory source path unavailable' : error.message));
  } finally {
    clearTimeout(timer);
    if (child?.pid) {
      child.stdin.end();
      if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => { const stop = setTimeout(resolve, 250); child.once('exit', () => { clearTimeout(stop); resolve(); }); });
      // Kill only this owned tree, including descendants holding inherited pipes.
      if (child.exitCode === null && child.signalCode === null) {
        if (process.platform === 'win32') {
          const killed = spawnSync(join(process.env.SystemRoot || 'C:/Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000, stdio: 'ignore' });
          if (killed.error || killed.status !== 0) { entries.push(entry('live-native-cleanup', 'blocked', 'Owned native process tree could not be terminated; OS permission required')); child.kill(); }
        } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already exited. */ } }
      }
      if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => { const stop = setTimeout(resolve, 5000); child.once('exit', () => { clearTimeout(stop); resolve(); }); });
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    }
    for (const item of entries) item.command = [exe, ...argv];
  }
  return entries;
}
