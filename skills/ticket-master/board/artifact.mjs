#!/usr/bin/env node
// Bake TICKETS.md into a single self-contained HTML page for the Artifact tool.
//
//   node skills/ticket-master/board/artifact.mjs [TICKETS.md] [out.html]
//
// Defaults: ./TICKETS.md -> ./.tickets-board.html (gitignored).
// Output is Artifact-shaped: no <!doctype>/<html>/<head>/<body>, the wrapper
// supplies those. Self-check: node artifact.mjs --selftest

import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const STATES = {
  " ": ["pending", "[ ]"],
  "~": ["in-progress", "[~]"],
  "!": ["blocked", "[!]"],
  ">": ["deferred", "[>]"],
  "x": ["done", "[x]"],
  "-": ["cancelled", "[-]"],
};
const GROUPS = [["B", "Bugs"], ["F", "Features"], ["A", "Agent-found"]];
// ponytail: anything outside B/F/A still has to appear somewhere — a ticket
// counted in the chips but listed in no section is a lying header.
const inGroups = (id) => GROUPS.some(([p]) => id.startsWith(p));
// ponytail: ID + em-dash + title is the whole line format the skill enforces.
// A hyphen separator is tolerated because hand-typed tickets use one.
const LINE = /^(\s*)- \[([ x~!>-])\]\s+([A-Za-z]+\d+[a-z]?)\s*[—-]\s*(.*)$/;

export function parse(md) {
  const out = [];
  for (const raw of md.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (!m) continue;
    const [, indent, ch, id, title] = m;
    const state = STATES[ch];
    if (!state) continue;
    out.push({ id, title: title.trim(), status: state[0], glyph: state[1], sub: indent.length > 0 });
  }
  return out;
}

export function tally(ts) {
  const n = (s) => ts.filter((t) => t.status === s).length;
  const c = {
    pending: n("pending"), inprogress: n("in-progress"), blocked: n("blocked"),
    deferred: n("deferred"), done: n("done"), cancelled: n("cancelled"),
  };
  c.open = c.pending + c.inprogress + c.blocked;
  c.closed = c.done + c.cancelled;
  c.total = c.open + c.deferred + c.closed;
  return c;
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function countLine(c) {
  return `${c.open} open (${c.pending} pending · ${c.inprogress} in-progress · ${c.blocked} blocked)` +
    ` · ${c.deferred} deferred · ${c.closed} closed (${c.done} done · ${c.cancelled} cancelled)` +
    ` · ${c.total} total`;
}

const li = (t) =>
  `<li class="s-${t.status.replace("-", "")}${t.sub ? " sub" : ""}">` +
  `<span class="g" aria-hidden="true">${t.glyph}</span>` +
  `<span class="id">${esc(t.id)}</span>` +
  `<span class="t">${esc(t.title)}</span>` +
  `<span class="st">${t.status}</span></li>`;

function section(name, ts) {
  if (!ts.length) return "";
  return `<section><h2>${name}<span class="n">${ts.length}</span></h2>` +
    `<ul>${ts.map(li).join("")}</ul></section>`;
}

const CHIPS = [
  ["pending", "pending"], ["inprogress", "in progress"], ["blocked", "blocked"],
  ["deferred", "deferred"], ["done", "done"], ["cancelled", "cancelled"],
];

function chips(c) {
  const cells = CHIPS.map(([k, label]) =>
    `<div class="chip c-${k}"><span class="v">${c[k]}</span><span class="k">${label}</span></div>`
  ).join("");
  return `<div class="counts" data-count-line="${esc(countLine(c))}">${cells}` +
    `<div class="chip c-total"><span class="v">${c.total}</span><span class="k">total</span></div></div>`;
}

export function render(md, title) {
  const ts = parse(md);
  const c = tally(ts);
  const isClosed = (t) => t.status === "done" || t.status === "cancelled";
  const parentOf = (t) => t.id.replace(/[a-z]$/, "");
  // A done sub-part of a live parent stays with the parent — filing it under
  // "closed" strands it beside unrelated tickets with nothing to explain it.
  const openParents = new Set(ts.filter((t) => !isClosed(t)).map((t) => t.id));
  const isLive = (t) => !isClosed(t) || (t.sub && openParents.has(parentOf(t)));
  const live = ts.filter(isLive);
  const closed = ts.filter((t) => !isLive(t));
  const sections = GROUPS.map(([p, name]) =>
    section(name, live.filter((t) => t.id.startsWith(p)))).join("") +
    section("Other", live.filter((t) => !inGroups(t.id)));
  const body = sections || `<p class="empty">Nothing open. The whole board is closed.</p>`;
  const rest = closed.length
    ? `<details><summary>${closed.length} closed — done and cancelled</summary>` +
      `<ul>${closed.map(li).join("")}</ul></details>`
    : "";
  return `<title>TICKETS · ${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;700&display=swap">
<style>
:root{
  --ground:#f4f5f2; --surface:#fbfbf9; --ink:#191c19; --mid:#5c625c; --faint:#8b918b;
  --rule:#dfe3dd; --amber:#a8590c; --red:#b0241a; --sans:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#141714; --surface:#191d19; --ink:#e7eae6; --mid:#9aa199; --faint:#6e756d;
  --rule:#2a2f29; --amber:#e0a25c; --red:#f08b80;
}}
:root[data-theme="dark"]{
  --ground:#141714; --surface:#191d19; --ink:#e7eae6; --mid:#9aa199; --faint:#6e756d;
  --rule:#2a2f29; --amber:#e0a25c; --red:#f08b80;
}
*{box-sizing:border-box}
body{background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.5;
  padding:2.5rem 1.25rem 4rem;max-width:56rem;margin:0 auto;-webkit-font-smoothing:antialiased}
header{display:flex;flex-direction:column;gap:1rem;margin-bottom:2rem}
h1{font-family:var(--mono);font-size:1rem;font-weight:700;letter-spacing:.04em;margin:0}
h1 .repo{color:var(--mid);font-weight:400}
.counts{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--rule);border-radius:3px;
  background:var(--surface);overflow:hidden}
.chip{flex:1 1 6rem;display:flex;flex-direction:column;gap:.1rem;padding:.6rem .75rem;
  border-left:1px solid var(--rule)}
.chip:first-child{border-left:0}
.chip .v{font-family:var(--mono);font-size:1.05rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.chip .k{font-size:.6875rem;color:var(--faint);letter-spacing:.05em;text-transform:uppercase}
.c-inprogress .v{color:var(--amber)}
.c-blocked .v{color:var(--red)}
.c-total{background:color-mix(in oklab,var(--ground) 60%,var(--surface))}
section{margin:0 0 2rem}
h2{display:flex;align-items:baseline;gap:.5rem;font-family:var(--mono);font-size:.6875rem;font-weight:700;
  text-transform:uppercase;letter-spacing:.12em;color:var(--mid);margin:0 0 .25rem;
  padding-bottom:.4rem;border-bottom:1px solid var(--rule)}
h2 .n{font-weight:400;color:var(--faint);font-variant-numeric:tabular-nums}
ul{list-style:none;margin:0;padding:0}
li{display:grid;grid-template-columns:1.9rem 3.4rem 1fr auto;gap:.5rem;align-items:baseline;
  padding:.4rem 0;border-bottom:1px solid var(--rule)}
li.sub{padding-left:1.4rem;grid-template-columns:1.9rem 3.4rem 1fr auto}
.g,.id{font-family:var(--mono);font-size:.8125rem}
.g{color:var(--faint)}
.id{font-weight:700;font-variant-numeric:tabular-nums}
.t{min-width:0;overflow-wrap:anywhere}
.st{font-size:.6875rem;color:var(--faint);letter-spacing:.04em;text-align:right;white-space:nowrap}
.s-inprogress .id,.s-inprogress .g,.s-inprogress .st{color:var(--amber)}
.s-blocked .id,.s-blocked .g,.s-blocked .st{color:var(--red)}
.s-deferred .id,.s-deferred .t{color:var(--mid)}
.s-done .t,.s-cancelled .t{color:var(--mid);text-decoration:line-through;text-decoration-color:var(--rule)}
details{margin-top:2.5rem;border-top:1px solid var(--rule);padding-top:.75rem}
summary{cursor:pointer;font-family:var(--mono);font-size:.6875rem;text-transform:uppercase;
  letter-spacing:.12em;color:var(--mid)}
summary:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
details ul{margin-top:.75rem}
.empty{color:var(--mid)}
</style>
<header>
  <h1>TICKETS <span class="repo">· ${esc(title)}</span></h1>
  ${chips(c)}
</header>
${body}
${rest}`;
}

const ok = (cond, msg, got) => { if (!cond) { console.error(`selftest FAIL: ${msg}`, got ?? ""); process.exitCode = 1; } };

function selftest() {
  const md = `
## Bugs
- [x] B1 — Done thing
- [~] B2 — Working <thing> & more
  - [ ] B2a — sub part
- [!] B3 — Stuck (blocked: creds)
## Features
- [ ] F1 — Dark mode
## Agent-found
- [>] A2 — Later (deferred: after rewrite)
- [-] A3 — Dropped
  - [x] B3a — done sub-part of a blocked parent
- [ ] Z9 — unrecognised prefix
not a ticket line
`;
  const ts = parse(md);
  const c = tally(ts);
  ok(ts.length === 9, "parsed 9", ts.length);
  ok(ts.find((t) => t.id === "B2a")?.sub === true, "B2a is a sub-part");
  ok(c.open === 5 && c.deferred === 1 && c.closed === 3 && c.total === 9, "counts", c);
  const html = render(md, "demo");
  ok(html.includes("Working &lt;thing&gt; &amp; more"), "escapes html");
  ok(!/<(!doctype|html|head|body)\b/i.test(html), "no wrapper tags");
  ok(html.includes('data-count-line="5 open (3 pending · 1 in-progress · 1 blocked) · 1 deferred · 3 closed (2 done · 1 cancelled) · 9 total"'), "count line");
  // every ticket the chips count must appear in a list — see inGroups
  const shown = (html.match(/<li /g) || []).length;
  ok(shown === 9, "every ticket rendered", shown);
  ok(html.indexOf(">B3a<") < html.indexOf("<details"), "done sub-part stays with its live parent");
  ok(html.includes(">Other<"), "unrecognised prefix gets a section");
  if (!process.exitCode) console.log("selftest: ok");
}

if (process.argv[2] === "--selftest") {
  selftest();
} else {
  const mdPath = resolve(process.argv[2] ?? join(process.cwd(), "TICKETS.md"));
  const outPath = resolve(process.argv[3] ?? join(process.cwd(), ".tickets-board.html"));
  let md;
  try {
    md = await readFile(mdPath, "utf8");
  } catch (e) {
    console.error(`artifact: cannot read ${mdPath} (${e.code ?? e.message}).
` +
      `Run this from the repo root, or pass the board's path as the first argument.`);
    process.exit(1);
  }
  const html = render(md, basename(resolve(mdPath, "..")));
  try {
    await writeFile(outPath, html, "utf8");
  } catch (e) {
    console.error(`artifact: cannot write ${outPath} (${e.code ?? e.message}).`);
    process.exit(1);
  }
  console.log(`artifact: ${parse(md).length} tickets from ${mdPath} -> ${outPath}`);
}
