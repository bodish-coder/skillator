import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKS_MD = join(HERE, '..', 'references', 'checks.md');

function loadContrastHelper(elements = []) {
  const md = readFileSync(CHECKS_MD, 'utf8');
  const section = md.split('## 6. Contrast, in the states nobody screenshots')[1] ?? '';
  const match = section.match(/```js\r?\n([\s\S]*?)```/);
  assert.ok(match, 'Contrast JS snippet must exist in references/checks.md §6');

  const tableRows = [];
  const getComputedStyle = el => ({
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
    fontSize: '16px',
    fontWeight: '400',
    ...el.style,
  });
  const document = {
    querySelectorAll: () => elements,
  };
  const consoleMock = {
    table: rows => tableRows.push(...rows),
  };

  const fn = new Function(
    'getComputedStyle',
    'document',
    'console',
    `${match[1]}\nreturn { lum, ratio, parse, over, bgOf, check };`,
  );
  return { ...fn(getComputedStyle, document, consoleMock), tableRows };
}

function makeChain(layers) {
  let parent = null;
  for (const layer of layers) {
    const node = {
      tagName: layer.tagName ?? 'DIV',
      className: layer.className ?? 'node',
      innerText: layer.innerText ?? 'Sample',
      children: layer.children ?? [],
      style: layer.style ?? {},
      parentElement: parent,
    };
    parent = node;
  }
  return parent;
}

test('A203 repro: gray100 text over half-black card on white body composites to ~1.49 (fails), not 5.92', () => {
  const leaf = makeChain([
    { tagName: 'BODY', className: 'page', style: { backgroundColor: 'rgb(255, 255, 255)' } },
    { tagName: 'DIV', className: 'card', style: { backgroundColor: 'rgba(0, 0, 0, 0.5)' } },
    {
      tagName: 'SPAN',
      className: 'label',
      innerText: 'Muted label',
      style: { color: 'rgb(100, 100, 100)', backgroundColor: 'rgba(0, 0, 0, 0)' },
    },
  ]);

  const { bgOf, ratio, check, tableRows } = loadContrastHelper([leaf]);
  const bg = bgOf(leaf);
  assert.deepEqual(bg, [127.5, 127.5, 127.5]);

  const rawRatio = ratio([100, 100, 100], bg);
  assert.ok(Math.abs(rawRatio - 1.488) < 0.005, `Expected ~1.488, got ${rawRatio}`);

  const res = check(leaf);
  assert.equal(res.ratio, 1.49);
  assert.notEqual(res.ratio, 5.92);
  assert.equal(res.need, 4.5);
  assert.equal(res.status, 'fail');
  assert.equal(res.unverified, false);
  assert.equal(tableRows.length, 1);
});

test('transparent intermediate layers over opaque ancestor resolve cleanly and default root to white', () => {
  const withOpaqueRoot = makeChain([
    { tagName: 'BODY', style: { backgroundColor: 'rgb(20, 40, 60)' } },
    { tagName: 'SECTION', style: { backgroundColor: 'transparent' } },
    { tagName: 'DIV', style: { backgroundColor: 'rgba(0, 0, 0, 0)' } },
    { tagName: 'P', style: { color: 'rgb(255, 255, 255)', backgroundColor: 'transparent' } },
  ]);

  const withoutOpaqueRoot = makeChain([
    { tagName: 'DIV', style: { backgroundColor: 'rgba(0, 0, 0, 0.5)' } },
    { tagName: 'SPAN', style: { color: 'rgb(100, 100, 100)', backgroundColor: 'transparent' } },
  ]);

  const { bgOf, check } = loadContrastHelper();
  assert.deepEqual(bgOf(withOpaqueRoot), [20, 40, 60]);
  assert.equal(check(withOpaqueRoot).status, 'pass');

  assert.deepEqual(bgOf(withoutOpaqueRoot), [127.5, 127.5, 127.5]);
  assert.equal(check(withoutOpaqueRoot).ratio, 1.49);
});

test('multi-layer nested translucent backgrounds composite back-to-front in order', () => {
  const nested = makeChain([
    { tagName: 'BODY', style: { backgroundColor: 'rgb(255, 255, 255)' } },
    { tagName: 'DIV', className: 'backdrop', style: { backgroundColor: 'rgba(0, 0, 0, 0.5)' } },
    { tagName: 'DIV', className: 'pill', style: { backgroundColor: 'rgba(255, 255, 255, 0.2)' } },
    {
      tagName: 'SPAN',
      className: 'text',
      style: { color: 'rgba(0, 0, 0, 0.5)', backgroundColor: 'transparent' },
    },
  ]);

  const { bgOf, check } = loadContrastHelper();
  const bg = bgOf(nested);
  // White (255) -> 50% black (127.5) -> 20% white (255*0.2 + 127.5*0.8 = 153)
  assert.deepEqual(bg, [153, 153, 153]);

  const res = check(nested);
  assert.equal(res.ratio, 2.99);
  assert.equal(res.status, 'fail');
});

test('unsupported backgroundImage or non-RGB colors are flagged unverified instead of passing', () => {
  const gradientBg = makeChain([
    { tagName: 'BODY', style: { backgroundColor: 'rgb(255, 255, 255)' } },
    {
      tagName: 'DIV',
      className: 'hero',
      style: {
        backgroundColor: 'rgba(0, 0, 0, 0)',
        backgroundImage: 'linear-gradient(90deg, #000, #fff)',
      },
    },
    { tagName: 'SPAN', className: 'hero-copy', style: { color: 'rgb(255, 255, 255)' } },
  ]);

  const oklchFg = makeChain([
    { tagName: 'BODY', style: { backgroundColor: 'rgb(255, 255, 255)' } },
    { tagName: 'SPAN', className: 'oklch-text', style: { color: 'oklch(0.62 0.19 250)' } },
  ]);

  const p3Bg = makeChain([
    { tagName: 'BODY', style: { backgroundColor: 'color(display-p3 0.1 0.2 0.3)' } },
    { tagName: 'SPAN', className: 'p3-text', style: { color: 'rgb(255, 255, 255)' } },
  ]);

  const { bgOf, check, tableRows } = loadContrastHelper([gradientBg, oklchFg, p3Bg]);

  assert.equal(bgOf(gradientBg), null);
  assert.equal(bgOf(p3Bg), null);

  for (const el of [gradientBg, oklchFg, p3Bg]) {
    const res = check(el);
    assert.equal(res.ratio, null);
    assert.equal(res.status, 'unverified');
    assert.equal(res.unverified, true);
  }

  // All 3 unverified elements must appear in the console.table output rather than being filtered out as passing
  assert.equal(tableRows.length, 3);
});
