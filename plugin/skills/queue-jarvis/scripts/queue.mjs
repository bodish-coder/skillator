#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fchmodSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const statuses = { ' ': 'pending', '~': 'in-progress', '!': 'blocked', '?': 'decide', '%': 'testing', v: 'verified', '>': 'deferred', x: 'done', '-': 'cancelled' };
const open = new Set(['pending', 'in-progress', 'blocked', 'decide', 'testing', 'verified']);
const types = { B: 'bug', F: 'feature', A: 'agent-found' };
const fields = ['id', 'app', 'src', 'owner', 'type', 'status', 'severity', 'release', 'depends-on'];
const metadata = /[ \t]*\[(app|src|priority|severity|release|depends-on|owner|decide|by|session|tester|working|work-history):[ \t]*([^\]\r\n]*)\]/gi;
const row = /^(\uFEFF?[ \t]*- \[([ ~!?%vx>-])\][ \t]+([A-Z]{1,3}\d+[a-z]?)(?:[ \t]+\(was[ \t]+[A-Z]{1,3}\d+[a-z]?\))?[ \t]*[—–-][ \t]*)(.*)$/;
const levels = ['P1', 'P2', 'P3', 'P4', 'P5'];
const tokenPattern = /^[a-f0-9]{64}$/;
const usage = `Queue Jarvis
  list [selector ...]
  preview P1|P2|P3|P4|P5 selector ...
  apply <preview-token> P1|P2|P3|P4|P5 selector ...
  auto-preview [selector ...]
  auto-apply <preview-token> [selector ...]
  Selectors: ${fields.map(field => `${field}=value`).join(' ')}`;

const clean = value => value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
const color = (code, value) => process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb'
  ? `\u001b[${code}m${value}\u001b[0m` : value;
const heading = state => color(96, `Queue Jarvis | ${state}`);

function ticketRows(lines) {
  return lines.flatMap((line, index) => {
    if (index % 2) return [];
    const match = row.exec(line);
    if (!match) return [];
    const [, prefix, status, id, body] = match;
    const tags = [...body.matchAll(metadata)];
    const attributes = new Map(tags.map(tag => [tag[1].toLowerCase(), tag[2].trim().toLowerCase()]));
    attributes.set('id', id.toLowerCase());
    attributes.set('status', statuses[status]);
    attributes.set('type', types[/^[A-Z]+/.exec(id)[0]] ?? '');
    const label = clean(body.split(metadata)[0]) || id;
    const priority = attributes.get('priority')?.toUpperCase();
    return [{ id, index, prefix, body, tags, attributes, label, priority: levels.includes(priority) ? priority : null }];
  });
}

function parseSelectors(args) {
  return args.map(arg => {
    const match = /^([a-z-]+)=(.+)$/i.exec(arg.trim());
    if (!match || !match[2].trim() || /[\p{Cc}\p{Cf}]/u.test(arg)) throw new Error(`Expected selector key=value: ${clean(arg)}`);
    const key = match[1].toLowerCase();
    const value = match[2].trim().toLowerCase();
    if (!fields.includes(key)) throw new Error(`Unknown selector ${key}. Choose from ${fields.join(', ')}.`);
    if (key === 'status' && !Object.values(statuses).includes(value)) throw new Error(`Unknown status: ${value}`);
    if (key === 'type' && !Object.values(types).includes(value)) throw new Error(`Unknown ticket type: ${value}`);
    return [key, value];
  });
}

function boardPath(currentWorktree) {
  if (currentWorktree) {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (result.error || result.status !== 0 || !result.stdout.trimEnd()) throw new Error('Run Queue Jarvis inside a Git checkout.');
    return join(result.stdout.trimEnd(), 'TICKETS.md');
  }
  const result = spawnSync('git', ['worktree', 'list', '--porcelain', '-z'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('Run Queue Jarvis inside a Git checkout.');
  const [main, ...info] = result.stdout.split('\0');
  if (!main.startsWith('worktree ') || info[0] === 'bare') throw new Error('The main Git checkout is unavailable.');
  return join(main.slice('worktree '.length), 'TICKETS.md');
}

function boardSnapshot(path) {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error('TICKETS.md must be a regular file.');
  const bytes = readFileSync(path);
  const lines = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).split(/(\r\n|\n)/);
  return { mode: stat.mode & 0o777, bytes, lines };
}

function matching(tickets, selectors) {
  const explicitStatus = selectors.some(([key]) => key === 'status' || key === 'id');
  return tickets.filter(({ attributes }) => (explicitStatus || open.has(attributes.get('status'))) && selectors.every(([key, value]) => {
    const actual = attributes.get(key) ?? '';
    if (key === 'app' || key === 'depends-on') return actual.split(',').some(item => item.trim() === value);
    return actual === value;
  }));
}

function previewToken(path, bytes, priority, selectors) {
  const canonical = [...new Set(selectors.map(([key, value]) => `${key}=${value}`))].sort();
  return createHash('sha256').update(JSON.stringify([path, priority, canonical])).update(bytes).digest('hex');
}

function updateLine(ticket, priority) {
  const { prefix, body, tags } = ticket;
  const current = tags.find(tag => tag[1].toLowerCase() === 'priority');
  if (current) {
    const leading = current[0].match(/^[ \t]*/)[0];
    return prefix + body.slice(0, current.index) + `${leading}[priority: ${priority}]` + body.slice(current.index + current[0].length);
  }
  const anchor = tags.filter(tag => ['app', 'src'].includes(tag[1].toLowerCase())).at(-1);
  const trailingNote = /(?:[ \t]+\([^()]*\))+[ \t]*$/.exec(body);
  const end = anchor ? anchor.index + anchor[0].length : tags[0]?.index ?? trailingNote?.index ?? body.trimEnd().length;
  return prefix + body.slice(0, end) + ` [priority: ${priority}]` + body.slice(end);
}

function replaceBoard(path, contents, mode) {
  const temp = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', mode);
  try {
    try {
      writeFileSync(fd, contents);
      if (process.platform !== 'win32') fchmodSync(fd, mode);
    } finally { closeSync(fd); }
    renameSync(temp, path);
  } catch (error) { unlinkSync(temp); throw error; }
}

function apply(path, token, priority, selectors) {
  const lock = `${path}.lock`;
  let fd;
  try { fd = openSync(lock, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('TICKETS.md is locked by another board edit. Retry after it finishes.');
    throw error;
  }
  const owner = `${process.pid} queue-jarvis ${randomUUID()}\n`;
  try { writeFileSync(fd, owner); }
  catch (error) { closeSync(fd); unlinkSync(lock); throw error; }
  closeSync(fd);
  try {
    const { bytes, lines, mode } = boardSnapshot(path);
    const automatic = priority === null;
    const tickets = ticketRows(lines);
    const changes = automatic ? automaticChanges(tickets, selectors) : plannedChanges(tickets, selectors, priority).map(ticket => ({ ticket, level: priority }));
    const rule = automatic ? automaticRule(changes) : priority;
    if (previewToken(path, bytes, rule, selectors) !== token) throw new Error('The board or rule changed. Run a new preview before applying.');
    for (const { ticket, level } of changes) lines[ticket.index] = updateLine(ticket, level);
    if (changes.length) replaceBoard(path, lines.join(''), mode);
    console.log(`${heading('Applied')}\n${changes.length} ticket(s) ${automatic ? 'assigned a priority' : 'updated to ' + priority}.`);
  } finally {
    try { if (readFileSync(lock, 'utf8') === owner) unlinkSync(lock); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function validateMatches(tickets, matches) {
  const seen = new Set();
  const duplicates = new Set();
  for (const { id } of tickets) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  for (const ticket of matches) {
    if (duplicates.has(ticket.id)) throw new Error(`Duplicate ticket ID ${ticket.id}. Resolve it before changing priority.`);
    if (ticket.tags.filter(tag => tag[1].toLowerCase() === 'priority').length > 1) {
      throw new Error(`Ticket ${ticket.id} has duplicate priority tags. Resolve them before changing priority.`);
    }
  }
}

function plannedChanges(tickets, selectors, priority) {
  const matches = matching(tickets, selectors);
  validateMatches(tickets, matches);
  return matches.filter(ticket => ticket.priority !== priority);
}

const severityPriority = new Map([
  ['critical', 'P1'], ['high', 'P2'], ['medium', 'P3'], ['low', 'P4'], ['trivial', 'P5'],
]);

function suggestedPriority({ attributes }) {
  const explicit = severityPriority.get(attributes.get('severity'));
  if (explicit) return explicit;
  if (attributes.get('status') === 'verified') return 'P5';
  if (attributes.get('type') === 'bug') return 'P2';
  if (attributes.get('type') === 'feature' || attributes.get('status') === 'in-progress') return 'P3';
  return 'P4';
}

function automaticChanges(tickets, selectors) {
  const eligible = tickets.filter(({ attributes }) => open.has(attributes.get('status')) && !attributes.has('priority'));
  const matches = matching(eligible, selectors);
  validateMatches(tickets, matches);
  return matches.map(ticket => ({ ticket, level: suggestedPriority(ticket) }));
}

const automaticRule = changes => ['auto', ...changes.map(({ ticket, level }) => [ticket.id, level])];

function automaticPreview(path, selectors) {
  const { bytes, lines } = boardSnapshot(path);
  const changes = automaticChanges(ticketRows(lines), selectors);
  console.log(`${heading('Auto-assign preview')}\n${changes.length} ticket(s) would change.`);
  console.log(levels.map(level => `${level}: ${changes.filter(change => change.level === level).length}`).join(' · '));
  for (const { ticket, level } of changes) console.log(`${ticket.id.padEnd(8)} Unranked -> ${level}   ${ticket.label}`);
  if (changes.length) console.log(`Preview token: ${previewToken(path, bytes, automaticRule(changes), selectors)}`);
}

function main(args) {
  const currentWorktree = args[0] === '--current-worktree';
  if (currentWorktree) args.shift();
  const [mode, ...rest] = args;
  if (!mode || mode === '--help' || mode === '-h') return console.log(usage);
  if (mode === 'auto-preview') {
    return automaticPreview(boardPath(currentWorktree), parseSelectors(rest));
  }
  if (mode === 'auto-apply') {
    const token = rest.shift();
    if (!tokenPattern.test(token ?? '')) throw new Error('Auto-apply requires a preview token.');
    return apply(boardPath(currentWorktree), token, null, parseSelectors(rest));
  }
  if (!['list', 'preview', 'apply'].includes(mode)) throw new Error(`Unknown command: ${clean(mode)}. See --help.`);
  const token = mode === 'apply' ? rest.shift() : null;
  const priority = mode === 'list' ? null : rest.shift()?.toUpperCase();
  if (mode === 'apply' && !tokenPattern.test(token ?? '')) throw new Error('Apply requires a preview token.');
  if (mode !== 'list' && (!levels.includes(priority) || !rest.length)) throw new Error('Preview and apply require P1–P5 and at least one selector.');
  const selectors = parseSelectors(rest);
  const path = boardPath(currentWorktree);
  if (mode === 'apply') return apply(path, token, priority, selectors);
  const { bytes, lines } = boardSnapshot(path);
  const tickets = ticketRows(lines);
  if (mode === 'preview') {
    const changes = plannedChanges(tickets, selectors, priority);
    console.log(`${heading('Preview')}\n${changes.length} ticket(s) would change.`);
    for (const ticket of changes) console.log(`${ticket.id.padEnd(8)} ${(ticket.priority ?? 'Unranked').padEnd(8)} -> ${color(33, priority)}   ${ticket.label}`);
    if (changes.length) console.log(`Preview token: ${previewToken(path, bytes, priority, selectors)}`);
    return;
  }
  const queue = matching(tickets, selectors).sort((a, b) => (a.priority ?? 'P6').localeCompare(b.priority ?? 'P6'));
  console.log(`${heading('Next up')}\n${queue.length} ticket(s) matched.`);
  for (const ticket of queue) console.log(`${ticket.id.padEnd(8)} ${(ticket.priority ?? 'Unranked').padEnd(8)} ${ticket.label}`);
}

try { main(process.argv.slice(2)); }
catch (error) { console.error(`Queue Jarvis: ${clean(error.message)}`); process.exitCode = 1; }
