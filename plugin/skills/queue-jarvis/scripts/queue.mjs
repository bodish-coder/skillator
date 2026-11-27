#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fchmodSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
  rules list
  rules add P1|P2|P3|P4|P5 field=value[,value...] ...
  rules edit <n> P1|P2|P3|P4|P5 field=value[,value...] ... [--rev <revision>]
  rules remove <n> [--rev <revision>]
  rules preview
  rules apply <preview-token>
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

function repoRoot(currentWorktree) {
  if (currentWorktree) {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (result.error || result.status !== 0 || !result.stdout.trimEnd()) throw new Error('Run Queue Jarvis inside a Git checkout.');
    return result.stdout.trimEnd();
  }
  const result = spawnSync('git', ['worktree', 'list', '--porcelain', '-z'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('Run Queue Jarvis inside a Git checkout.');
  const [main, ...info] = result.stdout.split('\0');
  if (!main.startsWith('worktree ') || info[0] === 'bare') throw new Error('The main Git checkout is unavailable.');
  return main.slice('worktree '.length);
}
const boardPath = currentWorktree => join(repoRoot(currentWorktree), 'TICKETS.md');
const rulesPath = root => join(root, '.skillator', 'priority-rules.md');

function boardSnapshot(path) {
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error('TICKETS.md must be a regular file.');
  const bytes = readFileSync(path);
  const lines = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).split(/(\r\n|\n)/);
  return { mode: stat.mode & 0o777, bytes, lines };
}

function fieldMatches(attributes, key, value) {
  const actual = attributes.get(key) ?? '';
  if (key === 'app' || key === 'depends-on') return actual.split(',').some(item => item.trim() === value);
  return actual === value;
}

function matching(tickets, selectors) {
  const explicitStatus = selectors.some(([key]) => key === 'status' || key === 'id');
  return tickets.filter(({ attributes }) => (explicitStatus || open.has(attributes.get('status')))
    && selectors.every(([key, value]) => fieldMatches(attributes, key, value)));
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

function withLock(path, busy, action) {
  const lock = `${path}.lock`;
  let fd;
  try { fd = openSync(lock, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(busy);
    throw error;
  }
  const owner = `${process.pid} queue-jarvis ${randomUUID()}\n`;
  try { writeFileSync(fd, owner); }
  catch (error) { closeSync(fd); unlinkSync(lock); throw error; }
  closeSync(fd);
  try { return action(); }
  finally {
    try { if (readFileSync(lock, 'utf8') === owner) unlinkSync(lock); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

// plan(tickets) -> { changes: [{ ticket, level }], rule, selectors, done }
function apply(path, token, plan) {
  withLock(path, 'TICKETS.md is locked by another board edit. Retry after it finishes.', () => {
    const { bytes, lines, mode } = boardSnapshot(path);
    const { changes, rule, selectors, done } = plan(ticketRows(lines));
    if (previewToken(path, bytes, rule, selectors) !== token) throw new Error('The board or rule changed. Run a new preview before applying.');
    for (const { ticket, level } of changes) lines[ticket.index] = updateLine(ticket, level);
    if (changes.length) replaceBoard(path, lines.join(''), mode);
    console.log(`${heading('Applied')}\n${changes.length} ticket(s) ${done}.`);
  });
}
const manualPlan = (priority, selectors) => tickets => ({
  changes: plannedChanges(tickets, selectors, priority).map(ticket => ({ ticket, level: priority })),
  rule: priority, selectors, done: 'updated to ' + priority,
});
const automaticPlan = selectors => tickets => {
  const changes = automaticChanges(tickets, selectors);
  return { changes, rule: automaticRule(changes), selectors, done: 'assigned a priority' };
};

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

const ruleLine = /^[-*][ \t]+(P[1-5])[ \t]*:[ \t]*(\S.*)$/i;
const rulesHeader = [
  '# Priority rules',
  '# One rule per line:  - P1: type=bug app=a,b,c',
  '# Conditions in a rule are AND-ed. A comma means any of. Rules of the same level are OR-ed.',
  '# A ticket matching several levels gets the highest. Apply with: queue.mjs rules preview',
];

function parseConditions(parts) {
  const seen = new Set();
  return parts.map(part => {
    const match = /^([a-z-]+)=(.*)$/i.exec(part.trim());
    if (!match || /[\p{Cc}\p{Cf}]/u.test(part)) throw new Error(`Expected field=value: ${clean(part)}`);
    const key = match[1].toLowerCase();
    if (!fields.includes(key)) throw new Error(`Unknown field ${key}. Choose from ${fields.join(', ')}.`);
    if (seen.has(key)) throw new Error(`Field ${key} is repeated. Put its values in one comma list.`);
    seen.add(key);
    const values = [...new Set(match[2].split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
    if (!values.length) throw new Error(`Field ${key} needs a value.`);
    for (const value of values) {
      if (key === 'status' && !Object.values(statuses).includes(value)) throw new Error(`Unknown status: ${value}`);
      if (key === 'type' && !Object.values(types).includes(value)) throw new Error(`Unknown ticket type: ${value}`);
    }
    return [key, values];
  });
}

const ruleText = ({ level, conditions }) => `${level}: ${conditions.map(([key, values]) => `${key}=${values.join(',')}`).join(' ')}`;
const ruleIdentity = ({ level, conditions }) => JSON.stringify([level, conditions.map(([key, values]) => [key, [...values].sort()]).sort()]);

function rulesSnapshot(path) {
  let stat;
  try { stat = lstatSync(path); }
  catch (error) {
    if (error.code === 'ENOENT') return { mode: 0o644, bytes: Buffer.alloc(0), lines: [''], missing: true };
    throw error;
  }
  if (!stat.isFile()) throw new Error('priority-rules.md must be a regular file.');
  const bytes = readFileSync(path);
  const lines = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).split(/(\r\n|\n)/);
  return { mode: stat.mode & 0o777, bytes, lines, missing: false };
}
const revisionOf = bytes => createHash('sha256').update(bytes).digest('hex');

// lines: the split-with-separators array; even indexes are lines.
function parseRules(lines) {
  const rules = [], invalid = [];
  lines.forEach((raw, index) => {
    if (index % 2) return;
    const text = raw.replace(/^﻿/, '').trim();
    if (!text || text.startsWith('#')) return;
    try {
      const match = ruleLine.exec(text);
      if (!match) throw new Error('Expected "- P1: field=value ..."');
      const conditions = parseConditions(match[2].trim().split(/[ \t]+(?=[a-z-]+=)/i));
      rules.push({ n: rules.length + 1, index, level: match[1].toUpperCase(), conditions });
    } catch (error) { invalid.push({ line: index / 2 + 1, reason: clean(error.message), text: clean(text) }); }
  });
  return { rules, invalid };
}

function parseRuleArgs(args) {
  const level = args[0]?.toUpperCase();
  if (!levels.includes(level) || args.length < 2) throw new Error('A rule needs P1–P5 and at least one field=value condition.');
  // The file splits a rule at whitespace before word=, so such a value would not read back as written.
  const split = args.slice(1).find(part => /[ \t]+[a-z-]+=/i.test(part.trim()));
  if (split !== undefined) throw new Error(`A value cannot contain whitespace followed by word=: ${clean(split)}. Pass each condition as its own argument.`);
  return { level, conditions: parseConditions(args.slice(1)) };
}

function editRules(path, rev, change) {
  // The lock file lives beside the rules file, so its folder must exist before locking.
  mkdirSync(dirname(path), { recursive: true });
  return withLock(path, 'priority-rules.md is locked by another edit. Retry after it finishes.', () => {
    const snapshot = rulesSnapshot(path);
    if (rev && rev !== revisionOf(snapshot.bytes)) throw new Error('The rules changed. Reload them and try again.');
    const { rules } = parseRules(snapshot.lines);
    const lines = [...snapshot.lines];
    const eol = lines[1] ?? '\n';
    const result = change({ rules, lines, eol, missing: snapshot.missing });
    const contents = lines.join('');
    if (snapshot.missing) writeFileSync(path, contents, { mode: snapshot.mode, flag: 'wx' });
    else replaceBoard(path, contents, snapshot.mode);
    return { ...result, revision: revisionOf(Buffer.from(contents)) };
  });
}

function rulesCommand(root, args) {
  const at = args.indexOf('--rev');
  const rev = at < 0 ? null : args.splice(at, 2)[1];
  if (at >= 0 && !tokenPattern.test(rev ?? '')) throw new Error('--rev needs the revision printed by rules list.');
  const [action, ...rest] = args;
  const path = rulesPath(root);
  const numbered = rule => `${rule.n}  ${ruleText(rule)}`;
  const pick = (rules, text) => {
    const rule = /^\d+$/.test(text ?? '') ? rules[Number(text) - 1] : undefined;
    if (!rule) throw new Error(`No rule ${clean(text ?? '')}. Run rules list.`);
    return rule;
  };
  const unique = (rules, next, except) => {
    const twin = rules.find(rule => rule !== except && ruleIdentity(rule) === ruleIdentity(next));
    if (twin) throw new Error(`That rule already exists (rule ${twin.n}).`);
  };
  if (action === 'list') {
    if (rest.length) throw new Error('Rules list takes no arguments.');
    const { bytes, lines } = rulesSnapshot(path);
    const { rules, invalid } = parseRules(lines);
    console.log(`${heading('Priority rules')}\n${rules.length} rule(s).`);
    for (const rule of rules) console.log(numbered(rule));
    for (const { line, reason, text } of invalid) console.log(`Invalid line ${line}: ${reason} | ${text}`);
    return console.log(`Rules revision: ${revisionOf(bytes)}`);
  }
  if (action === 'add') {
    const next = parseRuleArgs(rest);
    const { n, revision } = editRules(path, rev, ({ rules, lines, eol, missing }) => {
      unique(rules, next);
      if (missing || !lines.join('')) lines.splice(0, lines.length, rulesHeader.join(eol) + eol);
      else if (!/\n$/.test(lines.join(''))) lines.push(eol);
      lines.push(`- ${ruleText(next)}${eol}`);
      return { n: rules.length + 1 };
    });
    return console.log(`${heading('Rule added')}\n${n}  ${ruleText(next)}\nRules revision: ${revision}`);
  }
  if (action === 'edit') {
    const next = parseRuleArgs(rest.slice(1));
    const { n, revision } = editRules(path, rev, ({ rules, lines }) => {
      const rule = pick(rules, rest[0]);
      unique(rules, next, rule);
      lines[rule.index] = /^﻿?[ \t]*/.exec(lines[rule.index])[0] + `- ${ruleText(next)}`;
      return { n: rule.n };
    });
    return console.log(`${heading('Rule updated')}\n${n}  ${ruleText(next)}\nRules revision: ${revision}`);
  }
  if (action === 'remove') {
    if (rest.length !== 1) throw new Error('Rules remove takes one rule number.');
    const { text, revision } = editRules(path, rev, ({ rules, lines }) => {
      const rule = pick(rules, rest[0]);
      lines.splice(rule.index, 2);
      return { text: ruleText(rule) };
    });
    return console.log(`${heading('Rule removed')}\n${text}\nRules revision: ${revision}`);
  }
  if (action !== 'preview' && action !== 'apply') throw new Error(`Unknown rules command: ${clean(action ?? '')}. See --help.`);
  const board = join(root, 'TICKETS.md');
  const plan = tickets => {
    const { bytes, lines } = rulesSnapshot(path);
    const { rules, invalid } = parseRules(lines);
    if (invalid.length) throw new Error(`Fix line ${invalid[0].line} of ${join('.skillator', 'priority-rules.md')} before applying rules: ${invalid[0].reason}`);
    if (!rules.length) throw new Error('No priority rules yet. Add one: rules add P1 type=bug');
    const changes = ruleChanges(tickets, rules);
    return { changes, rule: ['rules', revisionOf(bytes), ...changes.map(({ ticket, level }) => [ticket.id, level])], selectors: [], done: 'updated by the priority rules' };
  };
  if (action === 'apply') {
    if (rest.length !== 1 || !tokenPattern.test(rest[0])) throw new Error('Rules apply requires a preview token.');
    return apply(board, rest[0], plan);
  }
  if (rest.length) throw new Error('Rules preview takes no filters.');
  const { bytes, lines } = boardSnapshot(board);
  const { changes, rule } = plan(ticketRows(lines));
  console.log(`${heading('Rules preview')}\n${changes.length} ticket(s) would change.`);
  console.log(levels.map(level => `${level}: ${changes.filter(change => change.level === level).length}`).join(' · '));
  for (const { ticket, level, rule: winner } of changes) {
    console.log(`${ticket.id.padEnd(8)} ${(ticket.priority ?? 'Unranked').padEnd(8)} -> ${level}   rule ${winner.n}   ${ticket.label}`);
  }
  if (changes.length) console.log(`Preview token: ${previewToken(board, bytes, rule, [])}`);
}

function ruleFieldMatches(attributes, key, value) {
  return (attributes.get(key) ?? '').split(',').some(item => item.trim().toLowerCase() === value);
}

function ruleChanges(tickets, rules) {
  const hits = tickets.flatMap(ticket => {
    const { attributes } = ticket;
    const rule = rules.filter(({ conditions }) =>
      (conditions.some(([key]) => key === 'status') || open.has(attributes.get('status')))
      && conditions.every(([key, values]) => values.some(value => ruleFieldMatches(attributes, key, value))))
      .sort((a, b) => a.level.localeCompare(b.level) || a.n - b.n)[0];
    return rule ? [{ ticket, level: rule.level, rule }] : [];
  });
  validateMatches(tickets, hits.map(hit => hit.ticket));
  return hits.filter(({ ticket, level }) => ticket.priority !== level);
}

function main(args) {
  const currentWorktree = args[0] === '--current-worktree';
  if (currentWorktree) args.shift();
  const [mode, ...rest] = args;
  if (!mode || mode === '--help' || mode === '-h') return console.log(usage);
  if (mode === 'rules') return rulesCommand(repoRoot(currentWorktree), rest);
  if (mode === 'auto-preview') {
    return automaticPreview(boardPath(currentWorktree), parseSelectors(rest));
  }
  if (mode === 'auto-apply') {
    const token = rest.shift();
    if (!tokenPattern.test(token ?? '')) throw new Error('Auto-apply requires a preview token.');
    return apply(boardPath(currentWorktree), token, automaticPlan(parseSelectors(rest)));
  }
  if (!['list', 'preview', 'apply'].includes(mode)) throw new Error(`Unknown command: ${clean(mode)}. See --help.`);
  const token = mode === 'apply' ? rest.shift() : null;
  const priority = mode === 'list' ? null : rest.shift()?.toUpperCase();
  if (mode === 'apply' && !tokenPattern.test(token ?? '')) throw new Error('Apply requires a preview token.');
  if (mode !== 'list' && (!levels.includes(priority) || !rest.length)) throw new Error('Preview and apply require P1–P5 and at least one selector.');
  const selectors = parseSelectors(rest);
  const path = boardPath(currentWorktree);
  if (mode === 'apply') return apply(path, token, manualPlan(priority, selectors));
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
