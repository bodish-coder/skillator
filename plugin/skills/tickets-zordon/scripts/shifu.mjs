#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const reports = '.skillator/reports/shifu';
const adapterId = /^[a-z][a-z0-9-]*$/;
const ticketId = /^[A-Z]{1,3}\d+[a-z]?$/;
const normalizeId = id => typeof id === 'string' ? id.replace(/^[a-z]+/i, prefix => prefix.toUpperCase()) : '';
const verdicts = ['PASS', 'FAIL', 'OWNER'];
const ticketStates = { '%': 'Testing', v: 'Verified', x: 'Done', '-': 'Dropped', '~': 'In progress', '!': 'Blocked', '>': 'Deferred', '?': 'Decide', ' ': 'Pending' };
const usage = `Shifu commands
/verify-shifu | /verify-shifu F191 | /verify-shifu F190 F191
/verify-shifu --deep F190 F191 | /verify-shifu --deep
/analyse-shifu [IDs] | /analyse-shifu --configure
node shifu.mjs select verify|analyse [IDs]    List eligible tickets
node shifu.mjs apps [available-host-apps.json]    List available and saved app IDs
node shifu.mjs configure <available-host-apps.json|-> <app IDs>    Save the repo choice
node shifu.mjs test <app ID>    Run a built-in app check now
node shifu.mjs snapshot <ID>    Return the current deep-review identity and cached result
node shifu.mjs store <result.json>    Save a deep result if its identity still matches
node shifu.mjs combine <evidence.json>    Combine fresh app checks and a matching deep result
node shifu.mjs report <run.json>    Write a standalone interactive HTML report`;

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}

function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr.toString().trim());
  return result.stdout;
}

function boardRows(board) {
  return board.split(/\r?\n/).flatMap(line => {
    const match = /^\s*- \[([%vx~!>? -])\]\s+([A-Z]{1,3}\d+[a-z]?)\b/.exec(line);
    return match ? [{ id: match[2], state: ticketStates[match[1]], line }] : [];
  });
}

export function selectTickets(board, mode, ids = []) {
  if (!['verify', 'analyse'].includes(mode)) throw new Error(`Unknown ticket selection mode: ${mode}`);
  const requested = [...new Set(ids.map(normalizeId))];
  if (requested.some(id => !ticketId.test(id))) throw new Error('Ticket IDs must look like F191 or F191a');
  const eligible = boardRows(board).filter(row => row.state === 'Testing' || row.state === 'Verified');
  const tickets = requested.length ? eligible.filter(row => requested.includes(row.id))
    : mode === 'verify' ? eligible.filter(row => row.state === 'Testing') : eligible;
  return {
    eligible: eligible.map(row => row.id),
    tickets,
    unavailable: requested.filter(id => !eligible.some(row => row.id === id)),
  };
}

function statePath(repo) {
  const common = git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir').toString().trim();
  return join(common, 'skillator', 'shifu.json');
}

function state(repo) {
  return readJson(statePath(repo), { apps: [], deep: {} });
}

function updateState(repo, update) {
  const path = statePath(repo);
  const temp = `${path}.${randomUUID()}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  let fd;
  try { fd = openSync(lock, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another Shifu command is updating repo configuration or deep results. Retry the command.');
    throw error;
  }
  try {
    const next = update(readJson(path, { apps: [], deep: {} }));
    writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' });
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
    closeSync(fd);
    unlinkSync(lock);
  }
}

function available(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  return result.status === 0;
}

function npmCli() {
  const dirs = [dirname(process.execPath), ...(process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')];
  return dirs.filter(Boolean).map(dir => join(dir, 'node_modules/npm/bin/npm-cli.js')).find(existsSync);
}

function builtInApps(repo) {
  const apps = [];
  const npm = npmCli();
  const npmCommand = npm ? [process.execPath, npm, 'test'] : process.platform !== 'win32' && available('npm') ? ['npm', 'test'] : null;
  if (npmCommand) {
    const manifests = new Set(['package.json', ...git(repo, 'ls-files', '-z', '--cached', '--', ':(glob)**/package.json').toString().split('\0')]);
    for (const manifest of [...manifests].sort()) {
      if (!manifest || !readJson(join(repo, manifest), {}).scripts?.test) continue;
      const folder = dirname(manifest).replaceAll('\\', '/');
      const suffix = createHash('sha256').update(folder).digest('hex').slice(0, 8);
      const slug = folder.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const id = folder === '.' ? 'npm' : `npm-${slug ? `${slug}-` : ''}${suffix}`;
      const label = folder === '.' ? 'npm test' : `npm test in ${folder}`;
      apps.push({ id, label, command: npmCommand, cwd: join(repo, folder) });
    }
  }
  const pytestConfigured = existsSync(join(repo, 'pytest.ini')) ||
    ['pyproject.toml', 'setup.cfg', 'tox.ini'].some(file => {
      const path = join(repo, file);
      return existsSync(path) && /^\[(?:tool\.pytest\.ini_options|pytest|tool:pytest)\]/m.test(readFileSync(path, 'utf8'));
    });
  if (pytestConfigured && available('pytest')) apps.push({ id: 'pytest', label: 'pytest', command: ['pytest'] });
  return apps;
}

export function listApps(repo, hostApps = []) {
  const known = builtInApps(repo).map(({ id, label }) => ({ id, label, runner: 'local' }));
  if (!Array.isArray(hostApps)) throw new Error('Available host apps must be an array');
  const ids = new Set(['npm', 'pytest', ...known.map(app => app.id)]);
  for (const { id, label } of hostApps) {
    if (!adapterId.test(id ?? '') || typeof label !== 'string' || !label.trim() || id.startsWith('npm-') || ids.has(id)) throw new Error(`Invalid or duplicate host app: ${id}`);
    ids.add(id);
    known.push({ id, label, runner: 'host' });
  }
  const { apps } = state(repo);
  return { available: known, selected: apps, unavailable: apps.filter(id => !known.some(app => app.id === id)) };
}

export function configureApps(repo, hostApps, ids) {
  const current = listApps(repo, hostApps);
  if (!ids.length || ids.some(id => !current.available.some(app => app.id === id))) {
    throw new Error('Choose one or more currently available testing apps');
  }
  const apps = [...new Set(ids)];
  updateState(repo, current => ({ ...current, apps }));
  return apps;
}

export function runApp(repo, id) {
  const app = builtInApps(repo).find(app => app.id === id);
  if (!app || !state(repo).apps.includes(id)) throw new Error(`Testing app is unavailable or unselected: ${id}`);
  const [command, ...args] = app.command;
  const result = spawnSync(command, args, { cwd: app.cwd ?? repo, stdio: 'inherit' });
  return { id, verdict: result.status === 0 ? 'PASS' : 'FAIL', evidence: `${app.label}: ${result.error?.message ?? (result.signal || `exit ${result.status}`)}` };
}

export function snapshot(repo, id) {
  id = normalizeId(id);
  if (!ticketId.test(id ?? '')) throw new Error('Supply one ticket ID');
  const board = readFileSync(join(repo, 'TICKETS.md'), 'utf8');
  const { tickets } = selectTickets(board, 'analyse', [id]);
  if (tickets.length !== 1) throw new Error(`Expected one eligible ticket for ${id}`);
  // Retain the full ticket's authored text, including its acceptance criteria.
  const criteria = tickets[0].line
    .replace(/^\s*- \[[%v]\]\s+/, '')
    .replace(/\s+\((?:verified (?:PASS|FAIL|OWNER) |verify-failed\b)[^)]*\)(?=\s|$)/gi, '');
  const hash = createHash('sha256');
  const add = value => { hash.update(`${Buffer.byteLength(value)}:`); hash.update(value); };
  add('shifu-deep-v1');
  add(criteria);
  const history = git(repo, 'log', '--format=%H %s', '--grep', `\\b${id}\\b`).toString();
  add(history.split('\n').filter(line => !/^[a-f0-9]+ board:/i.test(line)).join('\n'));
  const files = [...new Set(git(repo, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').toString().split('\0'))].sort();
  for (const file of files) {
    if (!file || file === 'TICKETS.md' || file === 'TICKETS-archive.md' || file.startsWith(`${reports}/`)) continue;
    add(file);
    const path = join(repo, file);
    let info;
    try { info = lstatSync(path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; add('deleted'); continue; }
    if (info.isSymbolicLink()) { add('symlink'); add(readlinkSync(path)); }
    else if (info.isFile()) { add(info.mode & 0o111 ? 'executable' : 'file'); add(readFileSync(path)); }
    else if (info.isDirectory()) add(git(path, 'rev-parse', 'HEAD'));
  }
  const identity = hash.digest('hex');
  const cached = state(repo).deep[id]?.[identity];
  return { id, identity, cached: cached?.identity === identity ? cached : null };
}

export function storeResult(repo, { id, identity, verdict, evidence }) {
  id = normalizeId(id);
  if (!verdicts.includes(verdict) || typeof evidence !== 'string' || !evidence.trim()) throw new Error('Supply a deep verdict and evidence');
  if (snapshot(repo, id).identity !== identity) throw new Error(`Implementation or acceptance criteria changed during deep verification of ${id}`);
  updateState(repo, current => ({ ...current, deep: { ...current.deep,
    [id]: { ...current.deep[id], [identity]: { identity, verdict, evidence } },
  } }));
}

export function combine(repo, { id, owner, apps }) {
  if (!Array.isArray(apps)) throw new Error('Supply testing app evidence');
  const current = snapshot(repo, id);
  const { cached } = current;
  id = current.id;
  const selected = state(repo).apps;
  const checks = selected.map(app => {
    const rows = apps.filter(row => row.id === app);
    if (rows.length !== 1 || typeof rows[0].evidence !== 'string' || !rows[0].evidence.trim() || ![...verdicts, 'N/A'].includes(rows[0].verdict)) {
      return { verdict: 'FAIL', evidence: `${app}: missing or invalid test evidence` };
    }
    return { verdict: rows[0].verdict, evidence: `${app}: ${rows[0].evidence}` };
  });
  if (!checks.some(check => check.verdict !== 'N/A')) checks.push({ verdict: 'FAIL', evidence: 'No applicable testing app evidence' });
  if (owner) checks.push({ verdict: 'OWNER', evidence: owner });
  checks.push(cached ? { verdict: cached.verdict, evidence: `Deep verification: ${cached.evidence}` }
    : { verdict: 'FAIL', evidence: 'Deep verification is missing or the implementation or acceptance criteria changed' });
  const verdict = checks.some(check => check.verdict === 'OWNER') ? 'OWNER' : checks.some(check => check.verdict === 'FAIL') ? 'FAIL' : 'PASS';
  return { id, verdict, evidence: checks.filter(check => check.verdict === verdict).map(check => check.evidence).join(' | '),
    checks: checks.map(check => `${check.verdict} ${check.evidence}`) };
}

const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function report(repo, { command = 'verify-shifu', deep = false, results, unavailable = [] }) {
  if (!['verify-shifu', 'analyse-shifu'].includes(command) || !Array.isArray(results) || !Array.isArray(unavailable)) throw new Error('Invalid Shifu report');
  const counts = { PASS: 0, FAIL: 0, OWNER: 0 };
  const states = new Set(['Testing', 'Verified']);
  const current = new Map(boardRows(readFileSync(join(repo, 'TICKETS.md'), 'utf8')).map(row => [row.id, row.state]));
  const rows = results.map(({ id, verdict, previous, evidence, checks = [] }) => {
    if (!ticketId.test(id) || !verdicts.includes(verdict) || !Array.isArray(checks)) throw new Error(`Invalid report row: ${id}`);
    const state = current.get(id) ?? 'Missing from board';
    states.add(state);
    counts[verdict]++;
    const transition = previous && previous !== state ? `${previous} → ${state}` : state;
    return `<details data-verdict="${verdict}" data-state="${state}"><summary><strong>${html(id)}</strong><span class="${verdict.toLowerCase()}">${verdict}</span><span>${html(transition)}</span></summary><div class="evidence">${html(evidence)}${checks.length ? `<ul>${checks.map(check => `<li>${html(check)}</li>`).join('')}</ul>` : ''}</div></details>`;
  });
  const date = new Date().toISOString();
  const path = join(repo, reports, `${command}-${date.replace(/[:.]/g, '-')}-${randomUUID()}.html`);
  const filter = (id, name, options) => `<label>${name} <select id="${id}"><option value="">All</option>${[...options].map(option => `<option>${option}</option>`).join('')}</select></label>`;
  const page = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${command} report</title>
<style>
  body{font:1rem/1.55 system-ui,sans-serif;background:#f7f8fa;color:#172033;max-width:55rem;padding:2rem 1rem;margin:auto}h1{margin-bottom:0}p{margin:.35rem 0 1rem}.controls{display:flex;flex-wrap:wrap;gap:1rem;margin:1rem 0}input,select{font:inherit;padding:.2rem .45rem}details{border:1px solid #ccd3de;border-radius:.4rem;background:white;margin:.5rem 0}summary{cursor:pointer;padding:.65rem 1rem}summary span{margin-left:1rem}.evidence{padding:.5rem 1rem 1rem;border-top:1px solid #ccd3de;white-space:pre-wrap;overflow-wrap:anywhere}.pass{color:#176443}.fail{color:#a02222}.owner{color:#73550d}
</style>
<main><h1>${command} report</h1><p>${date}${deep ? ' · Deep verification' : ''}</p><p>${rows.length} selected · ${counts.PASS} PASS · ${counts.FAIL} FAIL · ${counts.OWNER} OWNER</p>
${unavailable.length ? `<p>Unavailable IDs: ${html(unavailable.join(', '))}</p>` : ''}
<div class="controls"><label>Search <input id="search" type="search" placeholder="ID or evidence"></label>${filter('verdict', 'Verdict', verdicts)}${filter('state', 'Resulting state', states)}</div>
<p id="visible" aria-live="polite"></p><section aria-label="Ticket results">${rows.join('\n')}</section></main>
<script>
  const search = document.getElementById('search');
  const verdict = document.getElementById('verdict');
  const state = document.getElementById('state');
  const rows = [...document.querySelectorAll('details')];
  function update() {
    const query = search.value.trim().toLowerCase();
    for (const row of rows) row.hidden = (verdict.value && row.dataset.verdict !== verdict.value) ||
      (state.value && row.dataset.state !== state.value) || !row.textContent.toLowerCase().includes(query);
    document.getElementById('visible').textContent = rows.filter(row => !row.hidden).length + ' shown';
  }
  for (const control of [search, verdict, state]) control.addEventListener('input', update);
  update();
</script></html>`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, page, { flag: 'wx' });
  return path;
}

function main([action, target, ...args]) {
  if (!action || ['--help', 'help'].includes(action)) { console.log(usage); return; }
  const repo = git(process.cwd(), 'rev-parse', '--show-toplevel').toString().trim();
  const json = value => console.log(JSON.stringify(value, null, 2));
  if (action === 'select') json(selectTickets(readFileSync(join(repo, 'TICKETS.md'), 'utf8'), target, args));
  else if (action === 'apps') json(listApps(repo, target && target !== '-' ? readJson(target) : []));
  else if (action === 'configure') json(configureApps(repo, target === '-' ? [] : readJson(target), args));
  else if (action === 'test') {
    const result = runApp(repo, target);
    json(result);
    if (result.verdict === 'FAIL') process.exitCode = 1;
  } else if (action === 'snapshot') json(snapshot(repo, target));
  else if (action === 'store') storeResult(repo, readJson(target));
  else if (action === 'combine') json(combine(repo, readJson(target)));
  else if (action === 'report') console.log(report(repo, readJson(target)));
  else throw new Error(`Unknown Shifu action: ${action}`);
}

function isMain(path) {
  if (!path) return false;
  try {
    const url = pathToFileURL(realpathSync(path)).href;
    return process.platform === 'win32' ? url.toLowerCase() === import.meta.url.toLowerCase() : url === import.meta.url;
  } catch { return false; }
}

if (isMain(process.argv[1])) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
