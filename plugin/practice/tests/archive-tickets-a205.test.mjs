import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const archiveScriptPath = resolve(here, '../scripts/archive-tickets.sh');

function tid(l) {
  const m = /^[ \t]*- \[.\][ \t]*([A-Z]+[0-9]+[a-z]*)/.exec(l);
  return m ? m[1] : '';
}

function pid(id) {
  return id.replace(/[a-z]+$/, '');
}

// Direct port of split_board() awk grouping and output rules in archive-tickets.sh
export function splitBoardPort(boardText, sinceMap, cutoff) {
  const rawLines = boardText.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const n = rawLines.length;
  const line = [null, ...rawLines];
  let sect = '';
  let g = 0;
  let cur = 0;
  const gstart = {};
  const gsect = {};
  const gids = {};
  const gok = {};
  const grp = {};
  const pgrp = {};

  for (let i = 1; i <= n; i++) {
    const l = line[i];
    const id = tid(l);
    const p = pid(id);
    if (/^#/.test(l)) {
      if (/^## /.test(l)) sect = l.slice(3);
      cur = 0;
      continue;
    }
    if (/^[ \t]*$/.test(l)) continue;
    if (id !== '') {
      if (p in pgrp) {
        cur = pgrp[p];
        grp[i] = cur;
        gids[cur] = gids[cur] + ' ' + id;
      } else if (/^- /.test(l) && p === id) {
        g++;
        gstart[g] = i;
        gsect[g] = sect;
        gids[g] = id;
        gok[g] = 1;
        pgrp[p] = g;
        grp[i] = g;
        cur = g;
      } else if (cur && /^[ \t]+/.test(l)) {
        grp[i] = cur;
        gids[cur] = gids[cur] + ' ' + id;
        pgrp[p] = cur;
      } else {
        g++;
        gstart[g] = i;
        gsect[g] = sect;
        gids[g] = id;
        gok[g] = 1;
        pgrp[p] = g;
        grp[i] = g;
        cur = g;
      }
    } else if (cur && /^[ \t]+/.test(l)) {
      grp[i] = cur;
    } else {
      cur = 0;
    }
    if (grp[i] && id !== '') {
      const m = /^[ \t]*- \[(.)\]/.exec(l);
      const s = m ? m[1] : '';
      const ok = (s === 'x' || s === '-') && id in sinceMap && Number(sinceMap[id]) <= Number(cutoff);
      if (!ok) gok[grp[i]] = 0;
    }
  }

  const moved = [];
  for (let k = 1; k <= g; k++) {
    if (gok[k]) moved.push(`moved ${gids[k]}`);
  }

  const moveLines = [];
  const keepLines = [];
  let dropped = 0;
  let lastblank = 1;
  let squeezed = 0;

  for (let i = 1; i <= n; i++) {
    if (grp[i] && gok[grp[i]]) {
      moveLines.push(`${gsect[grp[i]]}\t${line[i]}`);
      dropped = 1;
      continue;
    }
    const blank = /^[ \t]*$/.test(line[i]);
    if (blank && lastblank && dropped) {
      squeezed++;
      continue;
    }
    keepLines.push(line[i]);
    lastblank = blank ? 1 : 0;
    if (!blank) dropped = 0;
  }

  return {
    moved,
    move: moveLines.join('\n') + (moveLines.length ? '\n' : ''),
    keep: keepLines.join('\n') + '\n',
    squeezed,
  };
}

test('archive-tickets.sh contains pid(id) parent grouping across blank lines and A205 selftest', () => {
  const script = readFileSync(archiveScriptPath, 'utf8');
  assert.match(script, /function pid\(id\) \{ sub\(\/\[a-z\]\+\$\/, "", id\); return id \}/);
  assert.match(script, /if \(l ~ \/\^\[ \\t\]\*\$\/\) continue/);
  assert.match(script, /if \(p in pgrp\)/);
  assert.match(script, /A205: closed parent B1 moved despite blank-separated open child B1a/);
});

test('closed old parent followed by blank line and indented open child stays on board with child', () => {
  const board = `# TICKETS

## Bugs

- [x] B1 - old closed parent

  - [ ] B1a - open child after blank line
`;
  const res = splitBoardPort(board, { B1: 100 }, 500);
  assert.deepEqual(res.moved, []);
  assert.equal(res.move, '');
  assert.match(res.keep, /- \[x\] B1 - old closed parent/);
  assert.match(res.keep, /  - \[ \] B1a - open child after blank line/);
});

test('closed old parent followed by blank line and unindented or indented open child stays on board', () => {
  const board = `# TICKETS

## Agent-found

- [x] A62 - old closed parent

- [~] A62a - in-progress child separated by blank line
`;
  const res = splitBoardPort(board, { A62: 100 }, 500);
  assert.deepEqual(res.moved, []);
  assert.equal(res.move, '');
  assert.match(res.keep, /- \[x\] A62 /);
  assert.match(res.keep, /- \[~\] A62a /);
});

test('closed old parent followed by blank line, old closed child, and blank-separated continuation archives together cleanly', () => {
  const board = `# TICKETS

## Bugs

- [x] B1 - old closed parent with blank-separated open child

  - [ ] B1a - open child after blank line

- [x] B2 - old closed parent with blank-separated old closed child

  - [x] B2a - old closed child after blank line

    continuation of B2a
`;
  const res = splitBoardPort(board, { B1: 100, B2: 100, B2a: 100 }, 500);
  assert.deepEqual(res.moved, ['moved B2 B2a']);
  assert.equal(
    res.move,
    [
      'Bugs\t- [x] B2 - old closed parent with blank-separated old closed child',
      'Bugs\t  - [x] B2a - old closed child after blank line',
      'Bugs\t    continuation of B2a',
      '',
    ].join('\n')
  );
  assert.match(res.keep, /- \[x\] B1 /);
  assert.match(res.keep, /  - \[ \] B1a /);
  assert.doesNotMatch(res.keep, /B2/);
  assert.doesNotMatch(res.keep, /continuation of B2a/);
  assert.doesNotMatch(res.keep, /\n\n\n/, 'No double blank lines left on board');
});
