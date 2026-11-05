import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "index.html");

function loadBoardRuntime() {
  const html = readFileSync(htmlPath, "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 2, "index.html must contain the app script block");
  const code = scripts[scripts.length - 1][1];

  const elements = new Map();
  const makeEl = () => ({
    textContent: "",
    innerHTML: "",
    value: "",
    checked: false,
    disabled: false,
    className: "",
    id: "",
    htmlFor: "",
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    querySelectorAll() { return []; },
    append() {},
    remove() {},
    focus() {},
    select() {},
  });
  const getEl = (sel) => {
    if (!elements.has(sel)) elements.set(sel, makeEl());
    return elements.get(sel);
  };

  const sandbox = {
    Intl,
    URLSearchParams,
    Set,
    Object,
    String,
    Boolean,
    parseInt,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem() {} },
    location: { hash: "", pathname: "/index.html" },
    history: { replaceState() {} },
    addEventListener() {},
    window: {
      matchMedia: () => ({ matches: false, addEventListener() {} }),
    },
    document: {
      documentElement: { lang: "en", dataset: {}, classList: { toggle() {} } },
      body: { classList: { add() {}, remove() {} } },
      querySelector: (sel) => getEl(sel),
      querySelectorAll: () => [],
      getElementById: (id) => getEl("#" + id),
      createElement: () => makeEl(),
      addEventListener() {},
      createRange: () => ({ selectNodeContents() {} }),
    },
  };

  vm.runInNewContext(
    `${code}\n;globalThis.__board = { parse, tally, tallyLine, visible, grouped, setPlain, rowHTML, load, app };`,
    sandbox,
    { filename: "index.html" }
  );

  return { ...sandbox.__board, elements, getEl };
}

test("A204: parse preserves lowercase sub-ticket suffix and normalizes only prefix", () => {
  const { parse } = loadBoardRuntime();
  const input = [
    "## Bugs",
    "- [~] B2 — Parent",
    "  - [ ] B2a — Child sub-part",
    "- [ ] b2b — Lowercase prefix and suffix sub-part",
  ].join("\n");

  const { tickets, errs } = parse(input);
  assert.equal(errs.length, 0);
  assert.equal(tickets.length, 3);

  assert.deepEqual(
    {
      id: tickets[0].id,
      prefix: tickets[0].prefix,
      num: tickets[0].num,
      part: tickets[0].part,
      parent: tickets[0].parent,
      sub: tickets[0].sub,
    },
    { id: "B2", prefix: "B", num: 2, part: "", parent: null, sub: false }
  );

  assert.deepEqual(
    {
      id: tickets[1].id,
      prefix: tickets[1].prefix,
      num: tickets[1].num,
      part: tickets[1].part,
      parent: tickets[1].parent,
      sub: tickets[1].sub,
    },
    { id: "B2a", prefix: "B", num: 2, part: "a", parent: "B2", sub: true }
  );

  assert.deepEqual(
    {
      id: tickets[2].id,
      prefix: tickets[2].prefix,
      num: tickets[2].num,
      part: tickets[2].part,
      parent: tickets[2].parent,
      sub: tickets[2].sub,
    },
    { id: "B2b", prefix: "B", num: 2, part: "b", parent: "B2", sub: true }
  );
});

test("A204: B2a groups under Bugs in type mode, under state with parent in status mode, and copies canonical ID", () => {
  const { load, app, grouped, visible, getEl } = loadBoardRuntime();
  const input = [
    "## Bugs",
    "- [~] B2 — Parent bug",
    "  - [ ] B2a — Child sub-part",
  ].join("\n");

  app.view = "type";
  assert.equal(load(input, "fixture"), true);

  const typeGroups = grouped(visible());
  assert.deepEqual(
    Array.from(typeGroups, (g) => ({ title: g.title, ids: Array.from(g.items, (t) => t.id) })),
    [{ title: "Bugs", ids: ["B2", "B2a"] }]
  );
  const plainByType = getEl("#plain").textContent;
  assert.match(plainByType, /^Bugs\n  \[~\] B2 — Parent bug\n    \[ \] B2a — Child sub-part\n/m);
  assert.equal(plainByType.includes("B2A"), false);
  assert.equal(plainByType.includes("Unrecognised IDs"), false);

  app.view = "status";
  load(input, "fixture");
  const statusGroups = grouped(visible());
  assert.deepEqual(
    Array.from(statusGroups, (g) => ({ title: g.title, ids: Array.from(g.items, (t) => t.id) })),
    [
      { title: "Pending", ids: ["B2a"] },
      { title: "In-progress", ids: ["B2"] },
    ]
  );
  const plainByStatus = getEl("#plain").textContent;
  assert.match(plainByStatus, /^Pending\n  \[ \] B2a — Child sub-part \(B2\)\n\nIn-progress\n  \[~\] B2 — Parent bug\n/m);
  assert.match(getEl("#out").innerHTML, /\(B2\)/);
});

test("A204 / A180: historical aliases before dash and at end of title parse, group, and copy cleanly", () => {
  const { load, parse, app, grouped, visible, getEl } = loadBoardRuntime();
  const input = [
    "## Features",
    "- [%] F107 (was F97) — clone-odo: a clean-room app-cloning skill [owner: @sher] (testing: unit tests pass)",
    "  - [ ] F107a (was f97a) — sub-part with historical alias",
    "## Bugs",
    "- [!] B8 — Fix crash (was B7) (blocked: waiting on B2a)",
  ].join("\n");

  const parsed = parse(input);
  assert.equal(parsed.errs.length, 0);
  assert.equal(parsed.tickets.length, 3);

  assert.equal(parsed.tickets[0].id, "F107");
  assert.equal(parsed.tickets[0].prefix, "F");
  assert.equal(parsed.tickets[0].title, "(was F97) clone-odo: a clean-room app-cloning skill");
  assert.equal(parsed.tickets[0].why, "testing: unit tests pass");

  assert.equal(parsed.tickets[1].id, "F107a");
  assert.equal(parsed.tickets[1].prefix, "F");
  assert.equal(parsed.tickets[1].part, "a");
  assert.equal(parsed.tickets[1].parent, "F107");
  assert.equal(parsed.tickets[1].sub, true);
  assert.equal(parsed.tickets[1].title, "(was F97a) sub-part with historical alias");

  assert.equal(parsed.tickets[2].id, "B8");
  assert.equal(parsed.tickets[2].title, "Fix crash (was B7)");
  assert.equal(parsed.tickets[2].why, "blocked: waiting on B2a");

  app.view = "type";
  load(input, "fixture");
  assert.deepEqual(
    Array.from(grouped(visible()), (g) => ({ title: g.title, ids: Array.from(g.items, (t) => t.id) })),
    [
      { title: "Bugs", ids: ["B8"] },
      { title: "Features", ids: ["F107", "F107a"] },
    ]
  );
  const plainType = getEl("#plain").textContent;
  assert.ok(plainType.includes("  [%] F107 — (was F97) clone-odo: a clean-room app-cloning skill [owner: @sher] (testing: unit tests pass)"));
  assert.ok(plainType.includes("    [ ] F107a — (was F97a) sub-part with historical alias"));
  assert.ok(plainType.includes("  [!] B8 — Fix crash (was B7) (blocked: waiting on B2a)"));

  app.view = "status";
  load(input, "fixture");
  assert.deepEqual(
    Array.from(grouped(visible()), (g) => ({ title: g.title, ids: Array.from(g.items, (t) => t.id) })),
    [
      { title: "Pending", ids: ["F107a"] },
      { title: "Testing", ids: ["F107"] },
      { title: "Blocked", ids: ["B8"] },
    ]
  );
  const plainStatus = getEl("#plain").textContent;
  assert.ok(plainStatus.includes("  [ ] F107a — (was F97a) sub-part with historical alias (F107)"));
  assert.ok(plainStatus.includes("  [%] F107 — (was F97) clone-odo: a clean-room app-cloning skill [owner: @sher] (testing: unit tests pass)"));
});
