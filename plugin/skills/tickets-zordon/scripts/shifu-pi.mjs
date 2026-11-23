import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { selectTickets } from './shifu.mjs';

const commandArguments = /^\/(verify|analyse)-shifu\s+(.*)$/;

function readBoard(cwd) {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) {
      try { return readFileSync(join(dir, 'TICKETS.md'), 'utf8'); }
      catch { return ''; }
    }
    if (dir === dirname(dir)) return '';
  }
}

export function shifuSuggestions(beforeCursor, board) {
  const match = commandArguments.exec(beforeCursor);
  if (!match) return null;
  const [, mode, args] = match;
  const words = args.split(/\s+/);
  const prefix = words.pop();
  if (words.some(word => ['--help', '--ids', '--configure'].includes(word))) return null;
  const options = words.length ? [] : mode === 'verify'
    ? [['--deep', 'Add code review. Use alone or before ticket IDs'], ['--help', 'Show slash-command examples'], ['--ids', 'List eligible IDs']]
    : [['--configure', 'Change testing apps for this repo'], ['--help', 'Show slash-command examples']];
  const items = [
    ...options,
    ...selectTickets(board, 'analyse').tickets.map(row => [row.id, row.state]),
  ].filter(([value]) => !words.some(word => word.toLowerCase() === value.toLowerCase()) && value.toLowerCase().startsWith(prefix.toLowerCase()))
    .map(([value, description]) => ({ value, label: value, description }));
  return items.length ? { prefix, items } : null;
}

// Pi versions without the provider API keep their generated prompt and its help.
export default function registerShifuCompletion(pi) {
  pi.on('session_start', (_event, ctx) => {
    ctx.ui.addAutocompleteProvider?.(current => ({
      triggerCharacters: current.triggerCharacters,
      getSuggestions(lines, line, col, options) {
        const beforeCursor = (lines[line] ?? '').slice(0, col);
        if (line === 0 && commandArguments.test(beforeCursor)) {
          return shifuSuggestions(beforeCursor, readBoard(ctx.cwd));
        }
        return current.getSuggestions(lines, line, col, options);
      },
      applyCompletion: (...args) => current.applyCompletion(...args),
      shouldTriggerFileCompletion(lines, line, col) {
        if (line === 0 && commandArguments.test((lines[line] ?? '').slice(0, col))) return true;
        return current.shouldTriggerFileCompletion?.(lines, line, col) ?? true;
      },
    }));
  });
}
